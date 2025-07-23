// Consolidate WCAG issues into Success Criteria-level ACR summaries
import fs from 'fs';
import path from 'path';
import https from 'https';
import { URL } from 'url';

// Load environment variables from .env file if it exists
try {
  if (fs.existsSync('.env')) {
    const envContent = fs.readFileSync('.env', 'utf8');
    envContent.split('\n').forEach(line => {
      const [key, value] = line.split('=');
      if (key && value && !process.env[key]) {
        process.env[key] = value.trim();
      }
    });
  }
} catch (error) {
  // Silently ignore .env loading errors
}

// Configuration
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// Parse CSV file
function parseCSV(csvContent) {
  const lines = csvContent.split('\n').filter(line => line.trim());
  const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim());
  
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length === headers.length) {
      const row = {};
      headers.forEach((header, index) => {
        row[header] = values[index];
      });
      rows.push(row);
    }
  }
  
  return rows;
}

// Simple CSV line parser that handles quoted fields
function parseCSVLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // Escaped quote
        current += '"';
        i++; // Skip next quote
      } else {
        // Toggle quote state
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      // Field separator
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  
  // Add the last field
  values.push(current.trim());
  
  return values;
}

// HTTPS request wrapper (same as in generate-issue-summaries.js)
function makeHttpsRequest(url, options, postData) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 300,
          status: res.statusCode,
          statusText: res.statusMessage,
          text: () => Promise.resolve(data),
          json: () => Promise.resolve(JSON.parse(data)),
          headers: {
            get: (header) => res.headers[header.toLowerCase()]
          }
        });
      });
    });
    
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

// Enhanced fetch with more robust rate limiting for Gemini API
async function fetchWithRetry(url, options, retries = 5) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      let response;
      
      if (options.method === 'POST') {
        const urlObj = new URL(url);
        const postData = options.body || '';
        
        const requestOptions = {
          hostname: urlObj.hostname,
          port: 443,
          path: urlObj.pathname + urlObj.search,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData),
            ...options.headers
          }
        };
        
        response = await makeHttpsRequest(urlObj, requestOptions, postData);
      } else {
        throw new Error('Only POST requests supported in this context');
      }
      
      if (response.ok) {
        return response;
      }
      
      if (response.status === 503 || response.status === 429) {
        // API is overloaded or rate limited - use much longer delays for 503 errors
        let baseWaitTime;
        if (response.status === 503) {
          // For 503 overload errors, use shorter initial wait
          baseWaitTime = attempt === 1 ? 15000 : Math.pow(2, attempt) * 10000; // Start with 15s, then exponential
        } else {
          // For 429 rate limits, use shorter waits
          baseWaitTime = attempt === 1 ? 5000 : Math.pow(2, attempt) * 3000;
        }
        const jitter = Math.random() * 5000; // Add up to 5s random jitter
        const waitTime = baseWaitTime + jitter;
        
        console.log(`⏳ API ${response.status === 503 ? 'overloaded' : 'rate limited'} (${response.status}), waiting ${Math.round(waitTime/1000)}s before retry ${attempt}/${retries}...`);
        await delay(waitTime);
        continue;
      }
      
      if (response.status >= 400) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }
      
    } catch (error) {
      if (attempt === retries) {
        throw error;
      }
      
      console.log(`⚠️  Attempt ${attempt} failed: ${error.message}`);
      
      // For connection errors, use shorter delays
      const waitTime = Math.min(attempt * 2000, 10000); // 2s, 4s, 6s, 8s, 10s max
      console.log(`⏳ Waiting ${waitTime/1000}s before retry...`);
      await delay(waitTime);
    }
  }
}

// Generate consolidated ACR summary for a WCAG Success Criterion
async function generateWCAGSummary(wcagSC, issues) {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY environment variable is required');
  }
  
  console.log(`   🤖 Generating consolidated summary for ${wcagSC} (${issues.length} issues)...`);
  
  // Prepare issue context for the AI - keep it concise
  const issueContexts = issues.map((issue, index) => {
    // Truncate very long ACR notes to prevent prompt overflow
    const truncatedNote = issue.acrNote.length > 200 ? 
      issue.acrNote.substring(0, 200) + '...' : 
      issue.acrNote;
    return `${index + 1}. ${truncatedNote}`;
  }).join('\n');
  
  const issueIds = issues.map(issue => issue.issueId).join(', ');
  
  const prompt = `You are an accessibility expert creating a consolidated WCAG Success Criterion assessment for an Accessibility Conformance Report (ACR).

WCAG SUCCESS CRITERION: ${wcagSC}

INDIVIDUAL ISSUE SUMMARIES:
${issueContexts}

Based on these ${issues.length} issues, provide exactly two responses:

1. ACR_ASSESSMENT: Choose the most appropriate conformance level:
   - "SUPPORTED" - if all issues are minor or resolved, with no significant barriers
   - "PARTIALLY_SUPPORTED" - if there are some barriers but basic functionality remains accessible
   - "NOT_SUPPORTED" - if there are significant barriers that prevent accessibility
   - "NOT_APPLICABLE" - if this Success Criterion doesn't apply to the current system

2. ACR_SUMMARY: Write a consolidated summary (1-3 paragraphs, as concise as possible):
   - For single issues: Write 1 focused paragraph describing the barrier and impact
   - For multiple similar issues: Group by issue type and write 1-2 paragraphs
   - For diverse issues: Write up to 3 paragraphs, each focusing on different barrier types
   - Start with issue count context only if multiple diverse issues: "Based on [X] identified issues..." 
   - Focus on the main accessibility barriers and user impact using concise language like "affects people without vision"
   - Group similar issues together rather than listing each one separately
   - Keep each paragraph focused on a specific aspect (barriers, impact, status/recommendations)
   - DO NOT mention WCAG Success Criterion numbers or titles (redundant given the context)
   - Use professional, concise language suitable for an ACR document
   - Prioritize brevity while maintaining clarity and completeness

Format your response as:
ACR_ASSESSMENT: [SUPPORTED/PARTIALLY_SUPPORTED/NOT_SUPPORTED/NOT_APPLICABLE]
ACR_SUMMARY: [your consolidated summary]

Keep the summary concise but comprehensive, focusing on the overall conformance picture rather than individual issue details.`;

  // Debug: Log prompt size
  const promptLength = prompt.length;
  console.log(`   📏 Prompt size: ${promptLength} characters`);

  try {
    const requestBody = {
      contents: [{
        parts: [{
          text: prompt
        }]
      }],
      generationConfig: {
        maxOutputTokens: 400, // Reduced from 800
        temperature: 0.1
      }
    };
    
    const response = await fetchWithRetry(
      `${GEMINI_API_URL}?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      }
    );
    
    const data = await response.json();
    
    if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
      throw new Error('Invalid response structure from Gemini API');
    }
    
    const responseText = data.candidates[0].content.parts[0].text;
    
    // Parse the response to extract assessment and summary
    const assessmentMatch = responseText.match(/ACR_ASSESSMENT:\s*(.*?)(?=ACR_SUMMARY:|$)/s);
    const summaryMatch = responseText.match(/ACR_SUMMARY:\s*(.*?)$/s);
    
    const assessment = assessmentMatch ? assessmentMatch[1].trim() : 'UNKNOWN';
    const summary = summaryMatch ? summaryMatch[1].trim() : 'Unable to generate summary';
    
    // Add rate limiting delay between requests - shorter for smaller prompts
    await delay(2000 + Math.random() * 3000); // 2-5 second delay
    
    return {
      assessment,
      summary,
      issueIds
    };
    
  } catch (error) {
    console.log(`   ❌ Error generating summary: ${error.message}`);
    
    // For persistent API overload errors, create a placeholder summary
    if (error.message.includes('503') || error.message.includes('overloaded')) {
      const placeholderSummary = `Based on ${issues.length} identified issue${issues.length > 1 ? 's' : ''}, automatic assessment could not be completed due to API limitations. Manual review required to determine conformance level and detailed impact analysis. Issues affect accessibility across multiple user groups and require technical evaluation.`;
      
      return {
        assessment: 'REQUIRES_REVIEW',
        summary: placeholderSummary,
        issueIds
      };
    }
    
    return {
      assessment: 'ERROR',
      summary: `Error generating summary: ${error.message}`,
      issueIds
    };
  }
}

// Show help information
function showHelp() {
  console.log('📋 WCAG Success Criteria ACR Consolidator');
  console.log('==========================================');
  console.log('');
  console.log('DESCRIPTION:');
  console.log('  Consolidates individual WCAG issue summaries into Success Criteria-level');
  console.log('  assessments suitable for Accessibility Conformance Reports (ACR).');
  console.log('');
  console.log('USAGE:');
  console.log('  node consolidate-wcag-summaries.js [options]');
  console.log('');
  console.log('OPTIONS:');
  console.log('  -h, --help     Show this help information');
  console.log('  -v, --verbose  Show additional processing details');
  console.log('');
  console.log('REQUIREMENTS:');
  console.log('  • GEMINI_API_KEY environment variable must be set');
  console.log('  • Latest wcag-detailed-issues_*.csv file in results/ directory');
  console.log('  • Latest wcag-issue-summaries_*.csv file in results/ directory');
  console.log('');
  console.log('OUTPUT:');
  console.log('  Creates wcag-acr-consolidated_[timestamp].csv with:');
  console.log('  • WCAG Success Criterion consolidations');
  console.log('  • ACR assessment levels (SUPPORTED/PARTIALLY_SUPPORTED/NOT_SUPPORTED/NOT_APPLICABLE)');
  console.log('  • Professional summaries suitable for ACR documents');
  console.log('');
  console.log('EXAMPLES:');
  console.log('  node consolidate-wcag-summaries.js           # Run consolidation (shows ACR summaries)');
  console.log('  node consolidate-wcag-summaries.js -v        # Show additional processing details');
  console.log('  node consolidate-wcag-summaries.js --help    # Show this help');
}

// Main consolidation function
async function consolidateWCAGSummaries() {
  // Check for help flag
  const args = process.argv.slice(2);
  if (args.includes('-h') || args.includes('--help')) {
    showHelp();
    process.exit(0);
  }
  
  const verbose = args.includes('-v') || args.includes('--verbose');
  
  console.log('📋 WCAG Success Criteria ACR Consolidator');
  console.log('==========================================');
  
  // Check for API key
  if (!GEMINI_API_KEY) {
    console.log('❌ Error: GEMINI_API_KEY environment variable is required');
    console.log('💡 Set it with: export GEMINI_API_KEY="your-api-key-here"');
    process.exit(1);
  }
  
  const resultsDir = 'results';
  if (!fs.existsSync(resultsDir)) {
    console.log('❌ Error: results directory not found');
    process.exit(1);
  }
  
  // Find the latest detailed issues CSV
  const detailedFiles = fs.readdirSync(resultsDir)
    .filter(f => f.startsWith('wcag-detailed-issues_') && f.endsWith('.csv'))
    .sort()
    .reverse();
  
  if (detailedFiles.length === 0) {
    console.log('❌ Error: No WCAG detailed issues CSV files found');
    process.exit(1);
  }
  
  // Find the latest issue summaries CSV
  const summaryFiles = fs.readdirSync(resultsDir)
    .filter(f => f.startsWith('wcag-issue-summaries_') && f.endsWith('.csv'))
    .sort()
    .reverse();
  
  if (summaryFiles.length === 0) {
    console.log('❌ Error: No WCAG issue summaries CSV files found');
    console.log('💡 Run generate-issue-summaries.js first');
    process.exit(1);
  }
  
  const detailedFile = path.join(resultsDir, detailedFiles[0]);
  const summaryFile = path.join(resultsDir, summaryFiles[0]);
  
  console.log(`📁 Using detailed issues: ${detailedFiles[0]}`);
  console.log(`📁 Using issue summaries: ${summaryFiles[0]}`);
  
  // Read both CSV files
  console.log('📊 Reading CSV files...');
  const detailedContent = fs.readFileSync(detailedFile, 'utf8');
  const summaryContent = fs.readFileSync(summaryFile, 'utf8');
  
  const detailedIssues = parseCSV(detailedContent);
  const issueSummaries = parseCSV(summaryContent);
  
  console.log(`✅ Loaded ${detailedIssues.length} detailed issues`);
  console.log(`✅ Loaded ${issueSummaries.length} issue summaries`);
  
  // Create a map of issue summaries by ID for quick lookup
  const summaryMap = new Map();
  issueSummaries.forEach(summary => {
    summaryMap.set(summary['Issue ID'], summary);
  });
  
  // Group issues by WCAG Success Criterion
  const wcagGroups = new Map();
  
  detailedIssues.forEach(issue => {
    const wcagSC = issue['WCAG SC'];
    const issueId = issue['Issue ID'];
    const summary = summaryMap.get(issueId);
    
    if (!wcagGroups.has(wcagSC)) {
      wcagGroups.set(wcagSC, []);
    }
    
    if (summary) {
      wcagGroups.get(wcagSC).push({
        issueId,
        wcagSC,
        title: issue['Issue Title'],
        acrNote: summary['ACR Note'] || 'No ACR note available'
      });
    }
  });
  
  console.log(`📊 Found ${wcagGroups.size} unique WCAG Success Criteria`);
  
  // Process each WCAG Success Criterion
  const results = [];
  const failedEntries = []; // Track failed entries for retry
  let processedCount = 0;
  
  for (const [wcagSC, issues] of wcagGroups) {
    try {
      console.log(`\n[${processedCount + 1}/${wcagGroups.size}] Processing ${wcagSC} (${issues.length} issues)...`);
      
      // Generate consolidated summary
      const consolidatedSummary = await generateWCAGSummary(wcagSC, issues);
      
      // Check if this needs retry due to API issues
      if (consolidatedSummary.assessment === 'REQUIRES_REVIEW') {
        failedEntries.push({ wcagSC, issues });
        console.log(`   ⚠️  ${wcagSC}: API overloaded, marked for retry`);
      } else {
        console.log(`   ✅ ${wcagSC}: ${consolidatedSummary.assessment}`);
        
        // Show ACR summary by default (always show, not just in verbose mode)
        console.log(`   📝 ACR Summary:`);
        const summaryLines = consolidatedSummary.summary.split('\n').filter(line => line.trim());
        summaryLines.forEach(line => {
          console.log(`      ${line.trim()}`);
        });
      }
      
      // Store result
      results.push({
        wcagSC,
        assessment: consolidatedSummary.assessment,
        summary: consolidatedSummary.summary,
        issueCount: issues.length,
        issueIds: consolidatedSummary.issueIds,
        processedAt: new Date().toISOString()
      });
      
      processedCount++;
      
    } catch (error) {
      console.log(`   ❌ Error processing ${wcagSC}: ${error.message}`);
      
      results.push({
        wcagSC,
        assessment: 'ERROR',
        summary: `Error: ${error.message}`,
        issueCount: issues.length,
        issueIds: issues.map(i => i.issueId).join(', '),
        processedAt: new Date().toISOString()
      });
    }
  }
  
  // Retry failed entries if any exist
  if (failedEntries.length > 0) {
    console.log(`\n🔄 Retrying ${failedEntries.length} failed entries after 30-second delay...`);
    await delay(30000); // Wait 30 seconds before retry
    
    for (const { wcagSC, issues } of failedEntries) {
      try {
        console.log(`\n🔄 Retrying ${wcagSC} (${issues.length} issues)...`);
        
        const consolidatedSummary = await generateWCAGSummary(wcagSC, issues);
        
        // Update the existing result
        const existingIndex = results.findIndex(r => r.wcagSC === wcagSC);
        if (existingIndex !== -1) {
          results[existingIndex] = {
            wcagSC,
            assessment: consolidatedSummary.assessment,
            summary: consolidatedSummary.summary,
            issueCount: issues.length,
            issueIds: consolidatedSummary.issueIds,
            processedAt: new Date().toISOString()
          };
          
          console.log(`   ✅ ${wcagSC}: ${consolidatedSummary.assessment} (retry successful)`);
          
          // Show ACR summary by default (always show, not just in verbose mode)
          console.log(`   📝 ACR Summary (retry):`);
          const summaryLines = consolidatedSummary.summary.split('\n').filter(line => line.trim());
          summaryLines.forEach(line => {
            console.log(`      ${line.trim()}`);
          });
        }
        
      } catch (error) {
        console.log(`   ❌ Retry failed for ${wcagSC}: ${error.message}`);
        // Keep the existing REQUIRES_REVIEW result
      }
    }
  }
  
  // Generate output CSV
  console.log('\n📊 Generating consolidated ACR CSV...');
  const timestamp = new Date().toISOString().slice(0, 16).replace(/:/g, '-').replace('T', '_');
  const outputFile = path.join(resultsDir, `wcag-acr-consolidated_${timestamp}.csv`);
  
  const csvHeaders = ['WCAG SC', 'ACR Assessment', 'ACR Summary', 'Issue Count', 'Issue IDs', 'Processed At'];
  let csvOutput = csvHeaders.join(',') + '\n';
  
  // Sort results by WCAG SC for better organization
  results.sort((a, b) => a.wcagSC.localeCompare(b.wcagSC));
  
  results.forEach(result => {
    const row = [
      escapeCSV(result.wcagSC),
      escapeCSV(result.assessment),
      escapeCSV(result.summary),
      escapeCSV(result.issueCount),
      escapeCSV(result.issueIds),
      escapeCSV(result.processedAt)
    ];
    csvOutput += row.join(',') + '\n';
  });
  
  fs.writeFileSync(outputFile, csvOutput, 'utf8');
  
  // Generate summary statistics
  const assessmentCounts = {};
  results.forEach(result => {
    const assessment = result.assessment;
    assessmentCounts[assessment] = (assessmentCounts[assessment] || 0) + 1;
  });
  
  console.log('\n📈 Consolidation Complete!');
  console.log('==========================');
  console.log(`✅ Successfully processed: ${processedCount}/${wcagGroups.size} WCAG Success Criteria`);
  console.log(`📁 Output file: ${outputFile}`);
  
  console.log('\n📊 ACR Assessment Summary:');
  Object.entries(assessmentCounts).sort().forEach(([assessment, count]) => {
    const icon = assessment === 'ERROR' ? '❌' : 
                 assessment === 'REQUIRES_REVIEW' ? '⚠️' : 
                 assessment === 'NOT_SUPPORTED' ? '🔴' :
                 assessment === 'PARTIALLY_SUPPORTED' ? '🟡' : '🟢';
    console.log(`   ${icon} ${assessment}: ${count} Success Criteria`);
  });
  
  if (assessmentCounts['REQUIRES_REVIEW']) {
    console.log('\n⚠️  REQUIRES_REVIEW entries need manual assessment due to API limitations.');
    console.log('💡 You can re-run the script later when the API is less busy.');
  }
  
  // Show brief completion summary since summaries were already displayed during processing
  console.log('\n📝 All ACR summaries were displayed during processing.');
  if (verbose) {
    console.log('💡 Verbose mode provided additional processing details.');
  }
  
  console.log('\n💡 Next steps:');
  console.log('• Review the consolidated ACR assessments');
  console.log('• Use the summaries for your Accessibility Conformance Report');
  console.log('• Focus on NOT_SUPPORTED and PARTIALLY_SUPPORTED criteria for remediation');
}

// CSV escape function
function escapeCSV(field) {
  if (field === null || field === undefined) {
    return '';
  }
  
  const str = String(field);
  
  if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  
  return str;
}

// Run the consolidator
consolidateWCAGSummaries().catch(console.error);

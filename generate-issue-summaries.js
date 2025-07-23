// Generate AI-powered summaries for WCAG issues using Gemini
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

// HTTPS request wrapper
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

// Enhanced fetch with rate limiting for Gemini API
async function fetchWithRetry(url, options, retries = 3) {
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
        // For GET requests
        const urlObj = new URL(url);
        const requestOptions = {
          hostname: urlObj.hostname,
          port: 443,
          path: urlObj.pathname + urlObj.search,
          method: options.method || 'GET',
          headers: {
            'User-Agent': 'curl/8.7.1',
            ...options.headers
          }
        };
        
        response = await makeHttpsRequest(urlObj, requestOptions);
      }
      
      if (response.ok) {
        return response;
      }
      
      if (response.status === 429) {
        // Rate limit hit, wait longer
        const waitTime = Math.pow(2, attempt) * 1000; // Exponential backoff
        console.log(`⏳ Rate limit hit, waiting ${waitTime/1000}s before retry ${attempt}/${retries}...`);
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
      await delay(1000 * attempt); // Simple backoff
    }
  }
}

// Parse CSV file
function parseCSV(csvContent) {
  const lines = csvContent.split('\n').filter(line => line.trim());
  const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim());
  
  const issues = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length === headers.length) {
      const issue = {};
      headers.forEach((header, index) => {
        issue[header] = values[index];
      });
      issues.push(issue);
    }
  }
  
  return issues;
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

// Fetch issue content from Drupal.org
async function fetchIssueContent(issueUrl) {
  try {
    console.log(`   📄 Fetching content from: ${issueUrl}`);
    
    const response = await fetchWithRetry(issueUrl, {
      headers: {
        'User-Agent': 'curl/8.7.1',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const html = await response.text();
    
    // Extract main content - issue title, description, and recent comments
    const titleMatch = html.match(/<h1[^>]*class="[^"]*page-title[^"]*"[^>]*>([^<]+)<\/h1>/);
    const title = titleMatch ? titleMatch[1].trim() : 'Unknown Title';
    
    // Extract issue description from the main content area
    let description = '';
    const descMatch = html.match(/<div class="field field-name-body field-type-text-with-summary[^>]*>.*?<div class="field-item even"[^>]*>(.*?)<\/div>/s);
    if (descMatch) {
      description = descMatch[1].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    }
    
    // Extract recent comments with more comprehensive content including patches/MRs
    const comments = [];
    const userAliases = new Set(); // Track all user aliases involved
    
    const commentPattern = /<div[^>]+id="comment-\d+"[^>]*>.*?<div class="comment-body"[^>]*>(.*?)<\/div>/gs;
    let commentMatch;
    while ((commentMatch = commentPattern.exec(html)) !== null && comments.length < 8) {
      let commentText = commentMatch[1].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      
      // Look for patch files, merge requests, and other key indicators
      const patchIndicators = commentText.match(/\b\d+[\w-]*\.patch\b/gi) || [];
      const mrIndicators = commentText.match(/merge request|![\d]+|MR[\d]+/gi) || [];
      const forkIndicators = commentText.match(/issue fork|fork.*created/gi) || [];
      
      if (commentText.length > 30 || patchIndicators.length > 0 || mrIndicators.length > 0 || forkIndicators.length > 0) {
        // Prioritize comments with patch/MR information
        const priority = patchIndicators.length + mrIndicators.length + forkIndicators.length;
        comments.push({
          text: commentText.substring(0, 800),
          priority: priority,
          hasPatchInfo: patchIndicators.length > 0,
          hasMRInfo: mrIndicators.length > 0,
          hasForkInfo: forkIndicators.length > 0
        });
      }
    }
    
    // Extract user aliases from the full page - look for comment authors and issue participants
    const userPattern = /<a[^>]+href="[^"]*\/user\/\d+[^"]*"[^>]*>([^<]+)<\/a>/g;
    let userMatch;
    while ((userMatch = userPattern.exec(html)) !== null) {
      const username = userMatch[1].trim();
      if (username && username !== 'Log in' && username !== 'Register' && !username.includes('@')) {
        userAliases.add(username);
      }
    }
    
    // Also extract from specific comment author patterns
    const authorPattern = /<span class="username"[^>]*>([^<]+)<\/span>/g;
    let authorMatch;
    while ((authorMatch = authorPattern.exec(html)) !== null) {
      const username = authorMatch[1].trim();
      if (username && username !== 'Anonymous') {
        userAliases.add(username);
      }
    }
    
    // Sort comments by priority (patch/MR info first) and take most relevant ones
    comments.sort((a, b) => b.priority - a.priority);
    const relevantComments = comments.slice(0, 5).map(c => c.text);
    
    return {
      title,
      description: description.substring(0, 1200), // Slightly longer description
      comments: relevantComments,
      userAliases: Array.from(userAliases).sort(),
      hasPatchActivity: comments.some(c => c.hasPatchInfo),
      hasMRActivity: comments.some(c => c.hasMRInfo),
      hasForkActivity: comments.some(c => c.hasForkInfo)
    };
    
  } catch (error) {
    console.log(`   ❌ Error fetching content: ${error.message}`);
    return {
      title: 'Unable to fetch title',
      description: 'Unable to fetch description',
      comments: []
    };
  }
}

// Generate summaries using Gemini AI
async function generateSummaries(issue, issueContent) {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY environment variable is required');
  }
  
  console.log(`   🤖 Generating AI summaries for issue ${issue['Issue ID']}...`);
  
  // Prepare the prompt with issue context
  const wcagSC = issue['WCAG SC'] || 'Unknown';
  const title = issueContent.title;
  const description = issueContent.description;
  const status = issue['Status'] || 'Unknown';
  const priority = issue['Priority'] || 'Unknown';
  const comments = issueContent.comments.join('\n\n');
  
  const prompt = `You are an accessibility expert analyzing a Drupal.org issue. Please provide four specific analyses:

ISSUE CONTEXT:
- Current WCAG Classification: ${wcagSC}
- Title: ${title}
- Status: ${status}
- Priority: ${priority}
- Description: ${description}
- Recent Comments: ${comments}

Please provide exactly four responses:

1. ACR_NOTE: A note for an accessibility conformance report (1-2 sentences):
   - Focus on the specific accessibility barrier and its impact on users with disabilities
   - Use concise impact language: "Affects people without vision", "Affects people without hearing", "Affects people with limited vision", "Affects people with limited hearing", "Affects people without speech", "Affects people with limited manipulation", "Affects people with limited reach and strength", "Affects people with limited language, cognitive, and learning abilities"
   - DO NOT mention WCAG Success Criteria numbers (tracked separately)
   - Use concise, professional compliance language

2. DEVELOPER_NOTE: Technical guidance for Drupal developers (3-4 sentences):
   - Analyze patch/merge request status from comments (look for .patch files, merge requests, issue forks)
   - If patches exist but are old, note they need updating/rebasing
   - Identify specific technical actions needed (code changes, testing, reviews)
   - Provide concrete next steps based on the most recent comments
   - If "Create issue fork" button exists but no actual patches, note "no current patches"

3. TITLE_ASSESSMENT: Evaluate if the title accurately reflects the issue content:
   - If title is accurate, respond: "TITLE_OK: Current title accurately reflects the issue"
   - If title needs improvement, respond: "TITLE_SUGGEST: [better title under 80 characters]"
   - Consider scope, specificity, and clarity improvements

4. WCAG_ASSESSMENT: Analyze the WCAG Success Criterion classification:
   - The issue is currently classified as "${wcagSC}"
   - Based on the description and comments, identify the most appropriate WCAG 2.1 Success Criterion (format: X.X.X)
   - If you agree with the current classification, respond: "WCAG_AGREE: ${wcagSC}"
   - If you think it should be different/additional, respond: "WCAG_SUGGEST: X.X.X - [brief explanation]"

Format your response as:
ACR_NOTE: [your accessibility conformance note]
DEVELOPER_NOTE: [your developer guidance note]
TITLE_ASSESSMENT: [your title evaluation]
WCAG_ASSESSMENT: [your WCAG classification analysis]

Focus on actionable insights and accurate technical details from the comments.`;

  try {
    const requestBody = {
      contents: [{
        parts: [{
          text: prompt
        }]
      }],
      generationConfig: {
        maxOutputTokens: 500,
        temperature: 0.1 // Low temperature for consistent, factual responses
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
    
    // Parse the response to extract all four components
    const acrMatch = responseText.match(/ACR_NOTE:\s*(.*?)(?=DEVELOPER_NOTE:|$)/s);
    const devMatch = responseText.match(/DEVELOPER_NOTE:\s*(.*?)(?=TITLE_ASSESSMENT:|$)/s);
    const titleMatch = responseText.match(/TITLE_ASSESSMENT:\s*(.*?)(?=WCAG_ASSESSMENT:|$)/s);
    const wcagMatch = responseText.match(/WCAG_ASSESSMENT:\s*(.*?)$/s);
    
    const acrNote = acrMatch ? acrMatch[1].trim() : 'Unable to generate ACR note';
    const developerNote = devMatch ? devMatch[1].trim() : 'Unable to generate developer note';
    const titleAssessment = titleMatch ? titleMatch[1].trim() : 'Unable to assess title';
    const wcagAssessment = wcagMatch ? wcagMatch[1].trim() : 'Unable to assess WCAG classification';
    
    // Add rate limiting delay
    await delay(1000 + Math.random() * 1000);
    
    return {
      acrNote,
      developerNote,
      titleAssessment,
      wcagAssessment
    };
    
  } catch (error) {
    console.log(`   ❌ Error generating summaries: ${error.message}`);
    return {
      acrNote: `Error generating ACR note: ${error.message}`,
      developerNote: `Error generating developer note: ${error.message}`,
      titleAssessment: `Error assessing title: ${error.message}`
    };
  }
}

// Main processing function
async function processIssues() {
  console.log('🤖 WCAG Issue AI Summary Generator');
  console.log('==================================');
  
  // Check for API key
  if (!GEMINI_API_KEY) {
    console.log('❌ Error: GEMINI_API_KEY environment variable is required');
    console.log('💡 Set it with: export GEMINI_API_KEY="your-api-key-here"');
    console.log('📖 Get an API key from: https://aistudio.google.com/app/apikey');
    process.exit(1);
  }
  
  // Find the latest WCAG issues CSV file
  const resultsDir = 'results';
  if (!fs.existsSync(resultsDir)) {
    console.log('❌ Error: results directory not found');
    console.log('💡 Make sure you have run extract-wcag-issues.js first');
    process.exit(1);
  }
  
  // Check for command line argument to specify file, otherwise use latest
  let targetFile = process.argv[2]; // Optional command line argument
  let inputFile;
  
  if (targetFile) {
    // Special handling for test-sample - generate fresh random sample
    if (targetFile === 'test-sample' || targetFile === 'test-sample.csv') {
      console.log('❌ Error: test-sample functionality has been removed');
      console.log('💡 Please specify a CSV file from the results/ directory');
      process.exit(1);
    }
    
    // Use specified file
    if (!targetFile.endsWith('.csv')) {
      targetFile += '.csv';
    }
    inputFile = path.join(resultsDir, targetFile);
    
    if (!fs.existsSync(inputFile)) {
      console.log(`❌ Error: Specified file not found: ${targetFile}`);
      process.exit(1);
    }
    console.log(`📁 Using specified file: ${targetFile}`);
  } else {
    // Find the latest wcag-detailed-issues file
    const files = fs.readdirSync(resultsDir)
      .filter(f => f.startsWith('wcag-detailed-issues_') && f.endsWith('.csv'))
      .sort()
      .reverse();
    
    if (files.length === 0) {
      console.log('❌ Error: No WCAG detailed issues CSV files found');
      console.log('💡 Run extract-wcag-issues.js first to generate the input data');
      process.exit(1);
    }
    
    inputFile = path.join(resultsDir, files[0]);
    console.log(`📁 Using latest file: ${files[0]}`);
  }
  
  // Read and parse the CSV
  console.log('📊 Reading CSV file...');
  const csvContent = fs.readFileSync(inputFile, 'utf8');
  const issues = parseCSV(csvContent);
  
  console.log(`✅ Loaded ${issues.length} issues`);
  
  // Process each issue
  const results = [];
  let processedCount = 0;
  let errorCount = 0;
  
  for (const issue of issues) {
    try {
      console.log(`\n[${processedCount + 1}/${issues.length}] Processing Issue ${issue['Issue ID']}: ${issue['Issue Title']?.substring(0, 60)}...`);
      
      // Fetch issue content
      const issueContent = await fetchIssueContent(issue['Issue URL']);
      
      // Generate AI summaries
      const summaries = await generateSummaries(issue, issueContent);
      
      // Display full ACR Note in CLI for immediate feedback
      console.log(`   📋 ACR Note: ${summaries.acrNote}`);
      
      // Store result with new fields
      results.push({
        issueId: issue['Issue ID'],
        acrNote: summaries.acrNote,
        developerNote: summaries.developerNote,
        titleAssessment: summaries.titleAssessment,
        wcagAssessment: summaries.wcagAssessment,
        userAliases: issueContent.userAliases.join(', '),
        processedAt: new Date().toISOString()
      });
      
      processedCount++;
      console.log(`   ✅ Completed issue ${issue['Issue ID']} (${issueContent.userAliases.length} users involved)`);
      
    } catch (error) {
      console.log(`   ❌ Error processing issue ${issue['Issue ID']}: ${error.message}`);
      errorCount++;
      
      // Add error entry
      results.push({
        issueId: issue['Issue ID'],
        acrNote: `Error: ${error.message}`,
        developerNote: `Error: ${error.message}`,
        titleAssessment: `Error: ${error.message}`,
        wcagAssessment: `Error: ${error.message}`,
        userAliases: '',
        processedAt: new Date().toISOString()
      });
    }
    
    // Rate limiting between issues
    if (processedCount < issues.length) {
      await delay(2000 + Math.random() * 1000);
    }
  }
  
  // Generate output CSV
  console.log('\n📊 Generating summary CSV...');
  const timestamp = new Date().toISOString().slice(0, 16).replace(/:/g, '-').replace('T', '_');
  const outputFile = path.join(resultsDir, `wcag-issue-summaries_${timestamp}.csv`);
  
  const csvHeaders = ['Issue ID', 'ACR Note', 'Developer Note', 'Title Assessment', 'WCAG Assessment', 'User Aliases', 'Processed At'];
  let csvOutput = csvHeaders.join(',') + '\n';
  
  results.forEach(result => {
    const row = [
      escapeCSV(result.issueId),
      escapeCSV(result.acrNote),
      escapeCSV(result.developerNote),
      escapeCSV(result.titleAssessment),
      escapeCSV(result.wcagAssessment),
      escapeCSV(result.userAliases),
      escapeCSV(result.processedAt)
    ];
    csvOutput += row.join(',') + '\n';
  });
  
  fs.writeFileSync(outputFile, csvOutput, 'utf8');
  
  console.log('\n📈 Summary Complete!');
  console.log('===================');
  console.log(`✅ Successfully processed: ${processedCount}/${issues.length} issues`);
  console.log(`❌ Errors encountered: ${errorCount}`);
  console.log(`📁 Output file: ${outputFile}`);
  console.log(`📊 Total summaries generated: ${results.length}`);
  
  if (errorCount > 0) {
    console.log(`\n⚠️  ${errorCount} issues had errors. Check the output CSV for details.`);
  }
  
  console.log('\n💡 Next steps:');
  console.log('• Review the generated summaries for accuracy');
  console.log('• Use the ACR notes for compliance documentation');
  console.log('• Use the developer notes to prioritize issue work');
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

// Run the processor
processIssues().catch(console.error);

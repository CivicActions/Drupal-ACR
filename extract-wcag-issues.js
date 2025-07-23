// Extract individual WCAG issues from Drupal.org search pages
import fs from 'fs';
import path from 'path';

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// Enhanced fetch with tool-based user agents that Drupal.org allows
// Using tool User-Agents instead of browser ones to avoid bot detection
const toolFingerprints = [
  { userAgent: 'curl/8.7.1' },
  { userAgent: 'curl/8.6.0' },
  { userAgent: 'Wget/1.21.3' },
  { userAgent: 'Wget/1.21.1' },
  { userAgent: 'curl/8.5.0' }
];

let requestCount = 0;
let sessionCookies = '';

function getCurrentFingerprint() {
  return toolFingerprints[requestCount % toolFingerprints.length];
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 30000, retries = 3) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  // Get current browser fingerprint and increment counter
  const fingerprint = getCurrentFingerprint();
  requestCount++;
  
  const defaultOptions = {
    headers: {
      'Accept': '*/*',
      'User-Agent': fingerprint.userAgent,
      ...(sessionCookies ? { 'Cookie': sessionCookies } : {}),
      ...options.headers
    },
    ...options
  };
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      // Add random delay before each request to simulate human behavior
      await delay(1000 + Math.random() * 2000);
      
      const response = await fetch(url, {
        ...defaultOptions,
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      // Store session cookies for subsequent requests
      const setCookie = response.headers.get('set-cookie');
      if (setCookie) {
        sessionCookies = setCookie.split(',').map(c => c.split(';')[0]).join('; ');
      }
      
      return response;
      
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (attempt === retries) {
        console.log(`❌ Failed after ${retries} attempts: ${error.message}`);
        throw error;
      }
      
      // Exponential backoff with jitter
      const delayTime = (attempt * 5000) + Math.random() * 3000;
      console.log(`⚠️  Attempt ${attempt} failed (${error.message}), retrying in ${Math.round(delayTime/1000)}s...`);
      await delay(delayTime);
      
      // Create new controller for next attempt
      const newController = new AbortController();
      const newTimeoutId = setTimeout(() => newController.abort(), timeoutMs);
      controller.signal = newController.signal;
      timeoutId = newTimeoutId;
    }
  }
}

function parseIssuesFromHTML(html, wcagCriteria) {
  const issues = [];
  
  try {
    // Enhanced patterns to match Drupal.org issue links more comprehensively
    const issuePatterns = [
      // Pattern 1: Standard project issue links
      /<a[^>]*href="(\/project\/([^\/]+)\/issues\/(\d+))"[^>]*>([^<]+)<\/a>/g,
      // Pattern 2: Node-based links  
      /<a[^>]*href="(\/node\/(\d+))"[^>]*class="[^"]*node[^"]*"[^>]*>([^<]+)<\/a>/g,
      // Pattern 3: Full URLs
      /<a[^>]*href="(https:\/\/www\.drupal\.org\/project\/([^\/]+)\/issues\/(\d+))"[^>]*>([^<]+)<\/a>/g,
      // Pattern 4: Search result titles
      /<h3[^>]*class="[^"]*search-result__title[^"]*"[^>]*>.*?<a[^>]*href="([^"]*\/project\/([^\/]+)\/issues\/(\d+))"[^>]*>([^<]+)<\/a>/g
    ];
    
    let match;
    const foundIssues = new Set(); // Track duplicates
    
    for (const pattern of issuePatterns) {
      while ((match = pattern.exec(html)) !== null) {
        let url, issueId, title, project;
        
        if (match.length === 5) {
          // Standard format: [full_match, url, project, issueId, title]
          [, url, project, issueId, title] = match;
        } else if (match.length === 4) {
          // Node format or other: [full_match, url, issueId, title]
          [, url, issueId, title] = match;
          const projectMatch = url.match(/\/project\/([^\/]+)\//);
          project = projectMatch ? projectMatch[1] : 'unknown';
        }
        
        // Skip if we couldn't extract proper data
        if (!issueId || !title) continue;
        
        // Skip duplicates
        if (foundIssues.has(issueId)) continue;
        foundIssues.add(issueId);
        
        // Clean up the title (decode HTML entities, normalize whitespace)
        const cleanTitle = title
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/\s+/g, ' ')
          .trim();
        
        // Make sure URL is absolute
        const fullUrl = url.startsWith('http') ? url : `https://www.drupal.org${url}`;
        
        issues.push({
          wcagCriteria,
          issueId,
          title: cleanTitle,
          url: fullUrl,
          project: project || 'unknown',
          extractedAt: new Date().toISOString()
        });
      }
    }
    
    // Also try to extract from JSON-LD or other structured data if present
    const jsonLdMatch = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([^<]+)<\/script>/g);
    if (jsonLdMatch) {
      jsonLdMatch.forEach(script => {
        try {
          const scriptContent = script.replace(/<script[^>]*>/, '').replace(/<\/script>/, '');
          const data = JSON.parse(scriptContent);
          // Process JSON-LD data if it contains issue information
          // This would need to be customized based on Drupal.org's actual JSON-LD structure
        } catch (e) {
          // Ignore JSON parsing errors
        }
      });
    }
    
    console.log(`🔍 Parsing found ${issues.length} unique issues using ${issuePatterns.length} patterns`);
    
    return issues;
    
  } catch (error) {
    console.error(`Error parsing HTML for ${wcagCriteria}:`, error.message);
    return [];
  }
}

async function extractIssuesFromCriteria(wcagCriteria, criteriaName, conformanceLevel, attemptNumber = 1) {
  console.log(`\n🔍 Extracting issues for: ${wcagCriteria} (${criteriaName}) - Attempt ${attemptNumber}`);
  console.log('=' + '='.repeat(60 + wcagCriteria.length));
  
  const searchUrl = `https://www.drupal.org/project/issues/search?status%5BOpen%5D=Open&issue_tags=${wcagCriteria}`;
  
  try {
    console.log(`📄 Fetching: ${searchUrl}`);
    
    const response = await fetchWithTimeout(searchUrl, {}, 25000, 3);
    
    if (!response.ok) {
      if (response.status === 403) {
        console.log(`🚫 Access denied (403) - implementing fallback strategy`);
        
        // Try RSS feed as fallback
        const rssUrl = `https://www.drupal.org/project/issues/search/rss?status%5B0%5D=Open&issue_tags_op=%3D&issue_tags=${wcagCriteria}`;
        console.log(`� Trying RSS fallback: ${rssUrl}`);
        
        const rssResponse = await fetchWithTimeout(rssUrl, {
          headers: { 'Accept': 'application/rss+xml, application/xml, text/xml' }
        }, 20000, 2);
        
        if (rssResponse.ok) {
          const rssText = await rssResponse.text();
          return parseIssuesFromRSS(rssText, wcagCriteria, criteriaName, conformanceLevel);
        } else {
          console.log(`❌ RSS fallback also failed: ${rssResponse.status}`);
          
          // Implement progressive retry strategy for persistent failures
          if (attemptNumber <= 3) {
            const delayMinutes = getRetryDelay(attemptNumber);
            const formattedTime = formatTimeRemaining(delayMinutes);
            
            console.log(`⏰ Bot detection is active. Waiting ${formattedTime} before retry ${attemptNumber + 1}/3...`);
            console.log(`🛡️  This extended delay helps avoid triggering additional security measures`);
            console.log(`📊 Progress will resume automatically at ${new Date(Date.now() + delayMinutes * 60 * 1000).toLocaleTimeString()}`);
            
            // Show countdown every 30 seconds for delays over 2 minutes
            if (delayMinutes >= 2) {
              const totalMs = delayMinutes * 60 * 1000;
              const checkInterval = 30000; // 30 seconds
              let remainingMs = totalMs;
              
              const countdownInterval = setInterval(() => {
                remainingMs -= checkInterval;
                const remainingMinutes = Math.ceil(remainingMs / 60000);
                
                if (remainingMs > 0) {
                  console.log(`⏳ ${formatTimeRemaining(remainingMinutes)} remaining for ${wcagCriteria}...`);
                } else {
                  clearInterval(countdownInterval);
                }
              }, checkInterval);
              
              await delay(totalMs);
              clearInterval(countdownInterval);
            } else {
              await delay(delayMinutes * 60 * 1000);
            }
            
            console.log(`🔄 Cooling period complete. Resuming ${wcagCriteria}...`);
            return await extractIssuesFromCriteria(wcagCriteria, criteriaName, conformanceLevel, attemptNumber + 1);
          } else {
            console.log(`🛑 All retry attempts exhausted for ${wcagCriteria}. Marking as temporarily blocked.`);
            console.log(`💡 Consider running this criteria again later when bot detection may be less active.`);
            return [];
          }
        }
      } else {
        console.log(`❌ HTTP Error: ${response.status} ${response.statusText}`);
        return [];
      }
    }
    
    const html = await response.text();
    console.log(`📝 Downloaded ${html.length} characters`);
    
    // Debug: save HTML to file for analysis if needed
    if (process.env.DEBUG_HTML) {
      const resultsDir = 'results';
      if (!fs.existsSync(resultsDir)) {
        fs.mkdirSync(resultsDir, { recursive: true });
      }
      fs.writeFileSync(path.join(resultsDir, `debug-${wcagCriteria}.html`), html);
    }
    
    const basicIssues = parseIssuesFromHTML(html, wcagCriteria);
    
    if (basicIssues.length > 0) {
      console.log(`✅ Found ${basicIssues.length} issues:`);
      basicIssues.slice(0, 3).forEach((issue, index) => {
        console.log(`   ${index + 1}. [${issue.project}] ${issue.title}`);
        console.log(`      🔗 ${issue.url}`);
      });
      
      if (basicIssues.length > 3) {
        console.log(`   ... and ${basicIssues.length - 3} more issues`);
      }
      
      // Fetch enhanced metadata for each issue
      console.log(`   📋 Fetching enhanced metadata for ${basicIssues.length} issues...`);
      const issues = [];
      for (const issue of basicIssues) {
        const enhancedIssue = await fetchEnhancedMetadata(issue);
        issues.push(enhancedIssue);
      }
      
      // Add criteria metadata to each issue
      return issues.map(issue => ({
        ...issue,
        wcagCriteriaName: criteriaName,
        conformanceLevel
      }));
      
    } else {
      console.log(`⚪ No issues found for ${wcagCriteria}`);
      
      // Debug: check if we got a valid page but just couldn't parse it
      if (html.includes('search-results') || html.includes('issue')) {
        console.log(`🔍 Page contains search results but parsing failed - may need pattern updates`);
      }
      
      return []; // No issues to process
    }
    
  } catch (error) {
    console.error(`💥 Error processing ${wcagCriteria}:`, error.message);
    return [];
  }
}

function parseIssuesFromRSS(rssText, wcagCriteria, criteriaName, conformanceLevel) {
  const issues = [];
  
  try {
    if (!rssText.includes('<rss')) {
      console.log(`⚠️  Invalid RSS response`);
      return [];
    }
    
    const items = rssText.split('<item>').slice(1);
    console.log(`📡 Found ${items.length} RSS items`);
    
    items.forEach(item => {
      const titleMatch = item.match(/<title>(.*?)<\/title>/);
      const linkMatch = item.match(/<link>(.*?)<\/link>/);
      
      if (titleMatch && linkMatch) {
        const title = titleMatch[1]
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"');
        const url = linkMatch[1];
        
        const issueIdMatch = url.match(/\/(\d+)$/);
        const issueId = issueIdMatch ? issueIdMatch[1] : '';
        
        const projectMatch = url.match(/\/project\/([^\/]+)\//);
        const project = projectMatch ? projectMatch[1] : 'unknown';
        
        if (issueId) {
          issues.push({
            wcagCriteria,
            wcagCriteriaName: criteriaName,
            conformanceLevel,
            issueId,
            title,
            url,
            project,
            extractedAt: new Date().toISOString()
          });
        }
      }
    });
    
    console.log(`✅ Extracted ${issues.length} issues from RSS`);
    return issues;
    
  } catch (error) {
    console.error(`Error parsing RSS for ${wcagCriteria}:`, error.message);
    return [];
  }
}

// WCAG 2.2 Success Criteria with names and levels (Complete set - 80 criteria)
const wcagCriteria = [
  // Level A (25 criteria)
  { code: 'wcag111', name: 'Non-text Content', level: 'Level A' },
  { code: 'wcag121', name: 'Audio-only and Video-only (Prerecorded)', level: 'Level A' },
  { code: 'wcag122', name: 'Captions (Prerecorded)', level: 'Level A' },
  { code: 'wcag123', name: 'Audio Description or Media Alternative (Prerecorded)', level: 'Level A' },
  { code: 'wcag131', name: 'Info and Relationships', level: 'Level A' },
  { code: 'wcag132', name: 'Meaningful Sequence', level: 'Level A' },
  { code: 'wcag133', name: 'Sensory Characteristics', level: 'Level A' },
  { code: 'wcag141', name: 'Use of Color', level: 'Level A' },
  { code: 'wcag142', name: 'Audio Control', level: 'Level A' },
  { code: 'wcag211', name: 'Keyboard', level: 'Level A' },
  { code: 'wcag212', name: 'No Keyboard Trap', level: 'Level A' },
  { code: 'wcag221', name: 'Timing Adjustable', level: 'Level A' },
  { code: 'wcag222', name: 'Pause, Stop, Hide', level: 'Level A' },
  { code: 'wcag241', name: 'Bypass Blocks', level: 'Level A' },
  { code: 'wcag242', name: 'Page Titled', level: 'Level A' },
  { code: 'wcag243', name: 'Focus Order', level: 'Level A' },
  { code: 'wcag244', name: 'Link Purpose (In Context)', level: 'Level A' },
  { code: 'wcag311', name: 'Language of Page', level: 'Level A' },
  { code: 'wcag321', name: 'On Focus', level: 'Level A' },
  { code: 'wcag322', name: 'On Input', level: 'Level A' },
  { code: 'wcag331', name: 'Error Identification', level: 'Level A' },
  { code: 'wcag332', name: 'Labels or Instructions', level: 'Level A' },
  { code: 'wcag411', name: 'Parsing', level: 'Level A' },
  { code: 'wcag412', name: 'Name, Role, Value', level: 'Level A' },
  
  // Level AA (28 criteria)
  { code: 'wcag124', name: 'Captions (Live)', level: 'Level AA' },
  { code: 'wcag125', name: 'Audio Description (Prerecorded)', level: 'Level AA' },
  { code: 'wcag134', name: 'Orientation', level: 'Level AA' },
  { code: 'wcag135', name: 'Identify Input Purpose', level: 'Level AA' },
  { code: 'wcag143', name: 'Contrast (Minimum)', level: 'Level AA' },
  { code: 'wcag144', name: 'Resize Text', level: 'Level AA' },
  { code: 'wcag145', name: 'Images of Text', level: 'Level AA' },
  { code: 'wcag1410', name: 'Reflow', level: 'Level AA' },
  { code: 'wcag1411', name: 'Non-text Contrast', level: 'Level AA' },
  { code: 'wcag1412', name: 'Text Spacing', level: 'Level AA' },
  { code: 'wcag1413', name: 'Content on Hover or Focus', level: 'Level AA' },
  { code: 'wcag214', name: 'Character Key Shortcuts', level: 'Level AA' },
  { code: 'wcag245', name: 'Multiple Ways', level: 'Level AA' },
  { code: 'wcag246', name: 'Headings and Labels', level: 'Level AA' },
  { code: 'wcag247', name: 'Focus Visible', level: 'Level AA' },
  { code: 'wcag2411', name: 'Focus Not Obscured (Minimum)', level: 'Level AA' },
  { code: 'wcag251', name: 'Pointer Gestures', level: 'Level AA' },
  { code: 'wcag252', name: 'Pointer Cancellation', level: 'Level AA' },
  { code: 'wcag253', name: 'Label in Name', level: 'Level AA' },
  { code: 'wcag254', name: 'Motion Actuation', level: 'Level AA' },
  { code: 'wcag257', name: 'Dragging Movements', level: 'Level AA' },
  { code: 'wcag258', name: 'Target Size (Minimum)', level: 'Level AA' },
  { code: 'wcag312', name: 'Language of Parts', level: 'Level AA' },
  { code: 'wcag323', name: 'Consistent Navigation', level: 'Level AA' },
  { code: 'wcag324', name: 'Consistent Identification', level: 'Level AA' },
  { code: 'wcag333', name: 'Error Suggestion', level: 'Level AA' },
  { code: 'wcag334', name: 'Error Prevention (Legal, Financial, Data)', level: 'Level AA' },
  { code: 'wcag413', name: 'Status Messages', level: 'Level AA' },
  
  // Level AAA (27 criteria)
  { code: 'wcag126', name: 'Sign Language (Prerecorded)', level: 'Level AAA' },
  { code: 'wcag127', name: 'Extended Audio Description (Prerecorded)', level: 'Level AAA' },
  { code: 'wcag128', name: 'Media Alternative (Prerecorded)', level: 'Level AAA' },
  { code: 'wcag129', name: 'Audio-only (Live)', level: 'Level AAA' },
  { code: 'wcag136', name: 'Identify Purpose', level: 'Level AAA' },
  { code: 'wcag146', name: 'Contrast (Enhanced)', level: 'Level AAA' },
  { code: 'wcag147', name: 'Low or No Background Audio', level: 'Level AAA' },
  { code: 'wcag148', name: 'Visual Presentation', level: 'Level AAA' },
  { code: 'wcag149', name: 'Images of Text (No Exception)', level: 'Level AAA' },
  { code: 'wcag213', name: 'No Timing', level: 'Level AAA' },
  { code: 'wcag223', name: 'No Timing', level: 'Level AAA' },
  { code: 'wcag224', name: 'Interruptions', level: 'Level AAA' },
  { code: 'wcag225', name: 'Re-authenticating', level: 'Level AAA' },
  { code: 'wcag226', name: 'Timeouts', level: 'Level AAA' },
  { code: 'wcag231', name: 'Three Flashes or Below Threshold', level: 'Level AAA' },
  { code: 'wcag232', name: 'Three Flashes', level: 'Level AAA' },
  { code: 'wcag233', name: 'Animation from Interactions', level: 'Level AAA' },
  { code: 'wcag248', name: 'Location', level: 'Level AAA' },
  { code: 'wcag249', name: 'Link Purpose (Link Only)', level: 'Level AAA' },
  { code: 'wcag2410', name: 'Section Headings', level: 'Level AAA' },
  { code: 'wcag2412', name: 'Focus Not Obscured (Enhanced)', level: 'Level AAA' },
  { code: 'wcag255', name: 'Target Size (Enhanced)', level: 'Level AAA' },
  { code: 'wcag256', name: 'Concurrent Input Mechanisms', level: 'Level AAA' },
  { code: 'wcag313', name: 'Unusual Words', level: 'Level AAA' },
  { code: 'wcag314', name: 'Abbreviations', level: 'Level AAA' },
  { code: 'wcag315', name: 'Reading Level', level: 'Level AAA' },
  { code: 'wcag316', name: 'Pronunciation', level: 'Level AAA' },
  { code: 'wcag325', name: 'Change on Request', level: 'Level AAA' },
  { code: 'wcag335', name: 'Help', level: 'Level AAA' },
  { code: 'wcag336', name: 'Error Prevention (All)', level: 'Level AAA' }
];

async function generateDetailedIssuesList() {
  console.log('🎯 WCAG Issues Extraction Tool');
  console.log('==============================');
  console.log(`📊 Processing ${wcagCriteria.length} WCAG SC`);
  console.log(`⏱️  This may take several minutes due to rate limiting\n`);
  
  // Warm up session by visiting the homepage first
  console.log('🔥 Warming up session...');
  try {
    const homeResponse = await fetchWithTimeout('https://www.drupal.org/', {}, 10000, 1);
    if (homeResponse.ok) {
      console.log('✅ Session established');
      await delay(2000); // Brief pause after session warming
    } else {
      console.log('⚠️  Session warming failed, continuing anyway...');
    }
  } catch (error) {
    console.log('⚠️  Session warming error, continuing anyway...');
  }
  
  let allIssues = [];
  let processedCount = 0;
  let successCount = 0;
  let blockedCount = 0;
  
  for (let i = 0; i < wcagCriteria.length; i++) {
    const criteria = wcagCriteria[i];
    const progress = `[${i + 1}/${wcagCriteria.length}]`;
    
    console.log(`${progress} Processing: ${criteria.code}`);
    
    try {
      const issues = await extractIssuesFromCriteria(criteria.code, criteria.name, criteria.level);
      
      if (issues.length > 0) {
        allIssues.push(...issues);
        successCount++;
        console.log(`✅ Successfully extracted ${issues.length} issues for ${criteria.code}`);
      } else {
        // Check if this was a complete failure vs just no issues found
        console.log(`⚪ No issues found for ${criteria.code} (may be blocked or genuinely empty)`);
      }
      
      processedCount++;
      
    } catch (error) {
      console.log(`❌ Failed to process ${criteria.code}: ${error.message}`);
      blockedCount++;
    }
    
    // More sophisticated rate limiting with session warming
    if (i < wcagCriteria.length - 1) {
      // Start with longer delays and reduce them as we build session trust
      const baseDelay = Math.max(15000 - (successCount * 1000), 5000);
      const jitter = Math.random() * 5000;
      const delayTime = baseDelay + jitter;
      
      console.log(`⏸️  Waiting ${Math.round(delayTime/1000)}s before next request... (session trust: ${successCount})`);
      await delay(delayTime);
      
      // Every 5 successful requests, do a longer pause to avoid pattern detection
      if (successCount > 0 && successCount % 5 === 0) {
        console.log(`🛑 Longer pause after ${successCount} successful requests...`);
        await delay(10000 + Math.random() * 10000);
      }
    }
  }
  
  // Generate CSV with detailed issue information
  let csvFile = '';
  if (allIssues.length > 0) {
    csvFile = await generateDetailedCSV(allIssues);
  }
  
  console.log(`\n📊 Final Summary:`);
  console.log('================');
  console.log(`✅ Successfully processed: ${successCount}/${processedCount} criteria`);
  console.log(`� Temporarily blocked: ${blockedCount} criteria`);
  console.log(`�📋 Total issues extracted: ${allIssues.length}`);
  if (csvFile) {
    console.log(`📁 Detailed CSV generated: ${csvFile}`);
  }
  
  if (blockedCount > 0) {
    console.log(`\n⚠️  ${blockedCount} criteria were blocked by bot detection.`);
    console.log(`💡 Consider running the script again later for these criteria:`);
    console.log(`   The bot detection system may be less active at different times.`);
  }
  
  if (allIssues.length === 0) {
    console.log(`\n💡 No issues were extracted. This could be due to:`);
    console.log(`   • Bot detection blocking all requests`);
    console.log(`   • Changes in Drupal.org HTML structure`);
    console.log(`   • Network issues or timeouts`);
    console.log(`   • WCAG tags not being used in the expected format`);
  }
}

async function generateDetailedCSV(allIssues) {
  try {
    console.log(`\n📊 Generating detailed CSV report...`);
    
    // CSV headers for detailed issue information
    const headers = [
      'WCAG SC',
      'Issue ID',
      'Issue Title',
      'Issue URL',
      'Project',
      'Status',
      'Priority',
      'Component',
      'Version',
      'Reporter',
      'Created',
      'Updated',
      'Comments',
      'Has Fork',
      'Last Commenter',
      'Extracted At'
    ];
    
    // Create CSV content
    let csvContent = headers.join(',') + '\n';
    
    // Sort issues by WCAG SC, then by project
    allIssues.sort((a, b) => {
      if (a.wcagCriteria !== b.wcagCriteria) {
        return a.wcagCriteria.localeCompare(b.wcagCriteria);
      }
      return a.project.localeCompare(b.project);
    });
    
    allIssues.forEach(issue => {
      const row = [
        escapeCSV(issue.wcagCriteria),
        escapeCSV(issue.issueId),
        escapeCSV(issue.title),
        escapeCSV(issue.url),
        escapeCSV(issue.project),
        escapeCSV(issue.status || ''),
        escapeCSV(issue.priority || ''),
        escapeCSV(issue.component || ''),
        escapeCSV(issue.version || ''),
        escapeCSV(issue.reporter || ''),
        escapeCSV(issue.created || ''),
        escapeCSV(issue.updated || ''),
        escapeCSV(issue.comments || '0'),
        escapeCSV(issue.hasFork || 'No'),
        escapeCSV(issue.lastCommenter || ''),
        escapeCSV(issue.extractedAt)
      ];
      csvContent += row.join(',') + '\n';
    });
    
    // Create results directory if it doesn't exist
    const resultsDir = 'results';
    if (!fs.existsSync(resultsDir)) {
      fs.mkdirSync(resultsDir, { recursive: true });
    }
    
    // Generate timestamp for filename (YYYY-MM-DD_HH-MM format)
    const now = new Date();
    const timestamp = now.toISOString().slice(0, 16).replace(/:/g, '-').replace('T', '_');
    
    // Write CSV file with timestamp
    const outputFile = path.join(resultsDir, `wcag-detailed-issues_${timestamp}.csv`);
    fs.writeFileSync(outputFile, csvContent, 'utf8');
    
    console.log(`✅ Detailed CSV report generated!`);
    console.log(`📁 File: ${outputFile}`);
    console.log(`📊 Total issues: ${allIssues.length}`);
    
    // Generate summary statistics
    const stats = generateStats(allIssues);
    console.log(`\n📈 Summary Statistics:`);
    console.log('=====================');
    console.log(`• Issues by criteria:`);
    Object.entries(stats.byCriteria).forEach(([criteria, count]) => {
      console.log(`  - ${criteria}: ${count} issues`);
    });
    console.log(`• Issues by project:`);
    Object.entries(stats.byProject).slice(0, 10).forEach(([project, count]) => {
      console.log(`  - ${project}: ${count} issues`);
    });
    
    return outputFile; // Return the filename for use in main function
    
  } catch (error) {
    console.error('❌ Error generating detailed CSV:', error.message);
  }
}

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

function generateStats(allIssues) {
  const byCriteria = {};
  const byProject = {};
  const byLevel = {};
  
  allIssues.forEach(issue => {
    // Count by criteria
    byCriteria[issue.wcagCriteria] = (byCriteria[issue.wcagCriteria] || 0) + 1;
    
    // Count by project
    byProject[issue.project] = (byProject[issue.project] || 0) + 1;
    
    // Count by conformance level
    byLevel[issue.conformanceLevel] = (byLevel[issue.conformanceLevel] || 0) + 1;
  });
  
  // Sort projects by issue count
  const sortedProjects = Object.entries(byProject)
    .sort(([,a], [,b]) => b - a)
    .reduce((r, [k, v]) => ({ ...r, [k]: v }), {});
  
  return { byCriteria, byProject: sortedProjects, byLevel };
}

// Progressive retry delays for bot detection scenarios
function getRetryDelay(attemptNumber) {
  const delays = {
    1: 2,    // 2 minutes for first retry
    2: 5,    // 5 minutes for second retry  
    3: 20    // 20 minutes for final retry
  };
  return delays[attemptNumber] || 30; // 30 minutes as fallback
}

// Helper function to format time remaining
function formatTimeRemaining(minutes) {
  if (minutes < 1) {
    return `${Math.round(minutes * 60)}s`;
  }
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = Math.round(minutes % 60);
    return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
  }
  return `${Math.round(minutes)}m`;
}

// Run the extraction
generateDetailedIssuesList().catch(console.error);

// Add function to extract enhanced metadata from individual issue pages
async function fetchEnhancedMetadata(issue) {
  try {
    console.log(`   📋 Fetching metadata for issue ${issue.issueId}...`);
    
    const response = await fetchWithTimeout(issue.url, {}, 15000, 2);
    
    if (!response.ok) {
      console.log(`   ⚠️  Could not fetch metadata for ${issue.issueId}: ${response.status}`);
      return issue; // Return original issue if metadata fetch fails
    }
    
    const html = await response.text();
    
    // Extract status - look for field-issue-status
    let status = '';
    const statusMatch = html.match(/<div class="field field-name-field-issue-status[^>]*><div class="field-items"><div class="field-item even">([^<]+)<\/div>/);
    if (statusMatch) {
      status = statusMatch[1].trim();
    }
    
    // Extract priority - look for field-issue-priority
    let priority = '';
    const priorityMatch = html.match(/<div class="field-label">Priority:&nbsp;<\/div><div class="field-items"><div class="field-item even">([^<]+)<\/div>/);
    if (priorityMatch) {
      priority = priorityMatch[1].trim();
    }
    
    // Extract component - look for field-issue-component
    let component = '';
    const componentMatch = html.match(/<div class="field-label">Component:&nbsp;<\/div><div class="field-items"><div class="field-item even">([^<]+)<\/div>/);
    if (componentMatch) {
      component = componentMatch[1].trim();
    }
    
    // Extract version - look for field-issue-version
    let version = '';
    const versionMatch = html.match(/<div class="field-label">Version:&nbsp;<\/div><div class="field-items"><div class="field-item even">([^<]+)<\/div>/);
    if (versionMatch) {
      version = versionMatch[1].trim();
    }
    
    // Extract reporter - look for the specific structure
    let reporter = '';
    const reporterMatch = html.match(/<div class="field-label">Reporter:&nbsp;<\/div><div class="field-items"><div class="field-item even"><a href="[^"]*" [^>]*class="username">([^<]+)<\/a>\s*<\/div>/);
    if (reporterMatch) {
      reporter = reporterMatch[1].trim();
    }
    
    // Extract created date - look for the specific structure
    let created = '';
    const createdMatch = html.match(/<div class="field-label">Created:&nbsp;<\/div><div class="field-items"><div class="field-item even">([^<]+)<\/div>/);
    if (createdMatch) {
      // Parse the date string "12 Oct 2019 at 03:45 UTC"
      const dateStr = createdMatch[1].trim();
      try {
        const parsedDate = new Date(dateStr.replace(' at ', ' ').replace(' UTC', ''));
        if (!isNaN(parsedDate)) {
          created = parsedDate.toISOString().split('T')[0]; // Format as YYYY-MM-DD
        }
      } catch (e) {
        console.log(`   ⚠️  Could not parse created date: ${dateStr}`);
      }
    }
    
    // Extract updated date - look for the specific structure
    let updated = '';
    const updatedMatch = html.match(/<div class="field-label">Updated:&nbsp;<\/div><div class="field-items"><div class="field-item even">([^<]+)<\/div>/);
    if (updatedMatch) {
      // Parse the date string "13 May 2025 at 20:58 UTC"
      const dateStr = updatedMatch[1].trim();
      try {
        const parsedDate = new Date(dateStr.replace(' at ', ' ').replace(' UTC', ''));
        if (!isNaN(parsedDate)) {
          updated = parsedDate.toISOString().split('T')[0]; // Format as YYYY-MM-DD
        }
      } catch (e) {
        console.log(`   ⚠️  Could not parse updated date: ${dateStr}`);
      }
    }
    
    // Extract comments count - count actual comment divs with comment IDs
    let comments = '0';
    // Look for comment divs with IDs like "comment-14202808"
    const commentDivMatches = html.match(/<div[^>]+id="comment-\d+"[^>]*>/g);
    if (commentDivMatches && commentDivMatches.length > 0) {
      comments = commentDivMatches.length.toString();
    } else {
      // Fallback: look for comment permalink patterns like "#1", "#2", etc.
      const permalinkMatches = html.match(/<a href="[^"]*#comment-\d+"[^>]*>\s*<span[^>]*>Comment\s*<\/span>\s*#(\d+)<\/a>/g);
      if (permalinkMatches && permalinkMatches.length > 0) {
        // Get the highest comment number
        const numbers = permalinkMatches
          .map(match => {
            const numMatch = match.match(/#(\d+)<\/a>/);
            return numMatch ? parseInt(numMatch[1]) : 0;
          })
          .filter(num => num > 0);
        
        if (numbers.length > 0) {
          comments = Math.max(...numbers).toString();
        }
      }
    }
    
    // Extract last commenter from "Most recent" link or comment metadata
    let lastCommenter = '';
    const mostRecentMatch = html.match(/<a href="[^"]*#comment-(\d+)" class="most-recent active">Most recent<\/a>/);
    if (mostRecentMatch) {
      const commentId = mostRecentMatch[1];
      // Try multiple patterns to find the comment author
      const patterns = [
        // Pattern 1: Look for username near comment ID
        new RegExp(`id="comment-${commentId}"[^>]*>.*?class="username">([^<]+)<`, 's'),
        // Pattern 2: Look for submitted by pattern
        new RegExp(`comment-${commentId}[^>]*>.*?<a href="/u/([^"]+)"`, 's'),
        // Pattern 3: Look for author in comment metadata
        new RegExp(`comment-${commentId}[^>]*>.*?submitted.*?/u/([^"]+)"`, 's')
      ];
      
      for (const pattern of patterns) {
        const match = html.match(pattern);
        if (match) {
          lastCommenter = match[1].trim();
          break;
        }
      }
    }
    
    // Fallback: get the last commenter from the update field if no comment-specific match
    if (!lastCommenter) {
      // Sometimes the updated field contains info about who last updated
      const updateMatch = html.match(/Updated.*?by.*?class="username">([^<]+)</);
      if (updateMatch) {
        lastCommenter = updateMatch[1].trim();
      }
    }
    
    // Check for issue fork - look for actual merge request indicators, not "Create" buttons
    let hasFork = 'No';
    // Look for actual merge request references or existing forks
    if ((html.includes('Merge request') && !html.includes('Create merge request')) || 
        html.includes('!\\d+') || // GitLab MR format
        (html.includes('fork') && html.includes('Available')) ||
        html.includes('merge-request-link')) {
      hasFork = 'Yes';
    }
    
    // Add small delay between metadata requests
    await delay(500 + Math.random() * 500);
    
    return {
      ...issue,
      status,
      priority,
      component,
      version,
      reporter,
      created,
      updated,
      comments,
      hasFork,
      lastCommenter
    };
    
  } catch (error) {
    console.log(`   ❌ Error fetching metadata for ${issue.issueId}: ${error.message}`);
    return issue; // Return original issue if error occurs
  }
}

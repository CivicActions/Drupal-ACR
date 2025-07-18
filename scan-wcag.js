// Using built-in fetch (Node.js 18+)
const fs = require('fs');
const path = require('path');

const VOCABULARY_ENDPOINT = 'https://www.drupal.org/api-d7/taxonomy_vocabulary.json';
const TERMS_ENDPOINT = 'https://www.drupal.org/api-d7/taxonomy_term.json';
const ISSUE_TAGS_ENDPOINT = 'https://www.drupal.org/api-d7/taxonomy_term.json?vocabulary=9';

// CSV output file with timestamp
const resultsDir = 'results';
if (!fs.existsSync(resultsDir)) {
  fs.mkdirSync(resultsDir, { recursive: true });
}

const now = new Date();
const timestamp = now.toISOString().slice(0, 16).replace(/:/g, '-').replace('T', '_');
const CSV_OUTPUT_FILE = path.join(resultsDir, `wcag-issues-report_${timestamp}.csv`);

// Add delay to respect rate limits
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// Fetch with timeout and retry logic
async function fetchWithTimeout(url, options = {}, timeoutMs = 30000, retries = 3) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  // Default headers to mimic a real browser
  const defaultOptions = {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      'Accept-Encoding': 'gzip, deflate, br',
      'DNT': '1',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      ...options.headers
    },
    ...options
  };
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, {
        ...defaultOptions,
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      return response;
      
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (attempt === retries) {
        console.log(`❌ Failed after ${retries} attempts: ${error.message}`);
        throw error;
      }
      
      console.log(`⚠️  Attempt ${attempt} failed (${error.message}), retrying in ${attempt * 2}s...`);
      await delay(attempt * 2000); // Exponential backoff
      
      // Create new controller for next attempt
      const newController = new AbortController();
      const newTimeoutId = setTimeout(() => newController.abort(), timeoutMs);
      controller.signal = newController.signal;
      timeoutId = newTimeoutId;
    }
  }
}

async function getVocabularies() {
  try {
    console.log('Fetching taxonomy vocabularies...');
    const res = await fetchWithTimeout(VOCABULARY_ENDPOINT, {}, 10000, 2);
    const data = await res.json();
    console.log('Available Taxonomy Vocabularies:');
    console.log('================================');
    data.list.forEach(vocab => {
      const highlight = vocab.vid === '9' ? ' <-- Issue tags (WCAG-related)' : '';
      console.log(`${vocab.vid}: ${vocab.name}${highlight}`);
      if (vocab.description) {
        console.log(`   Description: ${vocab.description}`);
      }
    });
    
    console.log('\nKey vocabularies for your use case:');
    console.log('- 9: Issue tags (for WCAG/accessibility tagging)');
    console.log('- 67: Tags (general content tags)');
    console.log('- 54: Keywords (content keywords)');
    
  } catch (error) {
    console.error('Error fetching vocabularies:', error);
  }
}

async function getIssueTags() {
  try {
    console.log('\nWaiting 2 seconds to respect rate limits...');
    await delay(2000);
    
    console.log('Fetching Issue Tags (vocabulary ID 9):');
    console.log('=====================================');
    
    const res = await fetchWithTimeout(ISSUE_TAGS_ENDPOINT, {}, 10000, 2);
    
    if (!res.ok) {
      console.log(`HTTP Error: ${res.status} ${res.statusText}`);
      return;
    }
    
    const responseText = await res.text();
    
    if (responseText.startsWith('<')) {
      console.log('API returned HTML instead of JSON. This could be due to:');
      console.log('- Rate limiting (too many requests)');
      console.log('- API endpoint changes');
      console.log('- Temporary server issues');
      console.log('\nResponse preview:', responseText.substring(0, 200) + '...');
      return;
    }
    
    const data = JSON.parse(responseText);
    
    if (data.list && data.list.length > 0) {
      console.log(`Total Issue Tags found: ${data.list.length}`);
      console.log('\nFirst 20 Issue Tags:');
      console.log('-------------------');
      
      data.list.slice(0, 20).forEach((term, index) => {
        console.log(`${index + 1}. ${term.name} (ID: ${term.tid})`);
        if (term.description) {
          console.log(`   Description: ${term.description}`);
        }
      });
      
      // Look for WCAG-related tags
      const wcagRelated = data.list.filter(term => 
        term.name && (
          term.name.toLowerCase().includes('wcag') ||
          term.name.toLowerCase().includes('accessibility') ||
          term.name.toLowerCase().includes('a11y') ||
          term.name.toLowerCase().includes('contrast') ||
          term.name.toLowerCase().includes('screen reader') ||
          term.name.toLowerCase().includes('keyboard')
        )
      );
      
      if (wcagRelated.length > 0) {
        console.log('\n🎯 WCAG/Accessibility Related Tags Found:');
        console.log('========================================');
        wcagRelated.forEach((term, index) => {
          console.log(`${index + 1}. ${term.name} (ID: ${term.tid})`);
          if (term.description) {
            console.log(`   Description: ${term.description}`);
          }
        });
      }
      
    } else {
      console.log('No issue tags found or unexpected response structure');
      console.log('Available properties:', Object.keys(data));
    }
    
  } catch (error) {
    console.error('Error fetching issue tags:', error.message);
  }
}

async function demonstrateAPIQueries() {
  console.log('\n🔍 API Query Building Examples:');
  console.log('===============================');
  
  console.log('\n1. Query issues with specific tag (example with "d8dx" tag):');
  console.log('   https://www.drupal.org/api-d7/node.json?type=project_issue&field_project=3060&taxonomy_vocabulary_9=20540');
  
  console.log('\n2. Query critical issues for Drupal core:');
  console.log('   https://www.drupal.org/api-d7/node.json?type=project_issue&field_project=3060&field_issue_priority=400');
  
  console.log('\n3. Query all project issues (useful for WCAG scanning):');
  console.log('   https://www.drupal.org/api-d7/node.json?type=project_issue');
  
  console.log('\n4. Filter by issue status (8 = needs review):');
  console.log('   https://www.drupal.org/api-d7/node.json?type=project_issue&field_issue_status=8');
  
  console.log('\n5. Get specific taxonomy vocabulary by ID:');
  console.log('   https://www.drupal.org/api-d7/taxonomy_vocabulary.json?vid=9');
  
  console.log('\n📋 Key Field Values for Filtering:');
  console.log('==================================');
  console.log('Issue Priority:');
  console.log('- 400 = Critical');
  console.log('- 300 = Major');
  console.log('- 200 = Normal');
  console.log('- 100 = Minor');
  
  console.log('\nIssue Status:');
  console.log('- 1 = active');
  console.log('- 8 = needs review');
  console.log('- 13 = needs work');
  console.log('- 14 = reviewed & tested by the community');
  
  console.log('\nIssue Category:');
  console.log('- 1 = Bug report');
  console.log('- 2 = Task');
  console.log('- 3 = Feature request');
  console.log('- 4 = Support request');
  
  console.log('\n💡 Pro Tips:');
  console.log('- Use limit= and page= for pagination (max 50 per request)');
  console.log('- Use sort= and direction= for custom ordering');
  console.log('- Filter by taxonomy_vocabulary_9= for issue tags');
  console.log('- field_project=3060 targets Drupal core specifically');
}

async function exploreAPI() {
  console.log('🚀 Exploring Drupal.org API - Taxonomy Vocabularies');
  console.log('===================================================\n');
  
  await getVocabularies();
  await getIssueTags();
  
  // Search for ALL WCAG 2.2 Success Criteria issues
  console.log('\n🎯 Starting comprehensive WCAG 2.2 analysis...');
  await searchAllWCAG22Criteria();
  
  await demonstrateAPIQueries();
  
  console.log('\n🎯 Next Steps for WCAG Analysis:');
  console.log('================================');
  console.log('1. Use RSS feeds to find issues by specific WCAG criteria');
  console.log('2. Search for wcag131, wcag211, accessibility, etc.');
  console.log('3. RSS feeds are more reliable than taxonomy API for this data');
  console.log('4. Cross-reference with issue status and priority for active items');
  console.log('5. Build targeted queries for specific Drupal projects or core');
}

async function findSpecificTag(searchTerm) {
  try {
    console.log(`\n🔍 Searching for tag: "${searchTerm}"`);
    console.log('=====================================');
    
    await delay(1000); // Rate limiting
    
    const res = await fetch(ISSUE_TAGS_ENDPOINT);
    
    if (!res.ok) {
      console.log(`HTTP Error: ${res.status} ${res.statusText}`);
      return null;
    }
    
    const responseText = await res.text();
    
    if (responseText.startsWith('<')) {
      console.log('API returned HTML - possible rate limiting');
      return null;
    }
    
    const data = JSON.parse(responseText);
    
    if (data.list) {
      // Search for the specific tag
      const foundTag = data.list.find(term => 
        term.name && term.name.toLowerCase() === searchTerm.toLowerCase()
      );
      
      if (foundTag) {
        console.log(`✅ Found tag: "${foundTag.name}" (ID: ${foundTag.tid})`);
        if (foundTag.description) {
          console.log(`   Description: ${foundTag.description}`);
        }
        
        // Build the query URL
        const queryUrl = `https://www.drupal.org/api-d7/node.json?type=project_issue&taxonomy_vocabulary_9=${foundTag.tid}`;
        console.log(`\n🔗 API URL to get all issues with this tag:`);
        console.log(queryUrl);
        
        // Also provide the human-readable Drupal.org URL
        const humanUrl = `https://www.drupal.org/project/issues/search?issue_tags=${foundTag.name}`;
        console.log(`\n🌐 Human-readable Drupal.org search URL:`);
        console.log(humanUrl);
        
        return foundTag;
      } else {
        console.log(`❌ Tag "${searchTerm}" not found`);
        
        // Show similar tags
        const similarTags = data.list.filter(term => 
          term.name && term.name.toLowerCase().includes(searchTerm.toLowerCase())
        );
        
        if (similarTags.length > 0) {
          console.log(`\n🔍 Similar tags found:`);
          similarTags.forEach(tag => {
            console.log(`- ${tag.name} (ID: ${tag.tid})`);
          });
        }
        
        // Show WCAG-related tags
        const wcagTags = data.list.filter(term => 
          term.name && (
            term.name.toLowerCase().includes('wcag') ||
            term.name.toLowerCase().includes('accessibility') ||
            term.name.toLowerCase().includes('a11y')
          )
        );
        
        if (wcagTags.length > 0) {
          console.log(`\n🎯 All WCAG/Accessibility related tags:`);
          wcagTags.forEach(tag => {
            console.log(`- ${tag.name} (ID: ${tag.tid})`);
          });
        }
        
        return null;
      }
    }
    
  } catch (error) {
    console.error('Error searching for tag:', error.message);
    return null;
  }
}

async function searchWCAGIssues() {
  console.log('\n🎯 WCAG Issue Search');
  console.log('===================');
  
  // Search for the specific tag in all available tags
  const wcag211Tag = await getAllIssueTags();
  
  if (wcag211Tag) {
    console.log(`\n📊 To get detailed issue data, you can also add filters:`);
    console.log(`- Active issues only: &field_issue_status=1`);
    console.log(`- Critical priority: &field_issue_priority=400`);
    console.log(`- Drupal core only: &field_project=3060`);
    console.log(`- Pagination: &limit=50&page=1`);
    
    console.log(`\n🔗 Example combined query (active WCAG 2.1.1 issues in Drupal core):`);
    console.log(`https://www.drupal.org/api-d7/node.json?type=project_issue&taxonomy_vocabulary_9=${wcag211Tag.tid}&field_project=3060&field_issue_status=1`);
  } else {
    console.log(`\n💡 If the "wcag211" tag doesn't exist, you might want to:`);
    console.log(`1. Search for more general WCAG tags`);
    console.log(`2. Search in issue titles/descriptions using text search`);
    console.log(`3. Look for alternative tag formats like "wcag-2.1.1" or "WCAG211"`);
  }
}

async function getAllIssueTags() {
  try {
    console.log('\n🔍 Fetching ALL issue tags to search for WCAG tags...');
    console.log('==================================================');
    
    await delay(1000);
    
    let allTags = [];
    let page = 0;
    let hasMore = true;
    
    while (hasMore && page < 10) { // Limit to 10 pages (500 tags max) to avoid infinite loop
      const url = `${ISSUE_TAGS_ENDPOINT}&limit=50&page=${page}`;
      console.log(`Fetching page ${page + 1}...`);
      
      const res = await fetch(url);
      
      if (!res.ok) {
        console.log(`HTTP Error: ${res.status} ${res.statusText}`);
        break;
      }
      
      const responseText = await res.text();
      
      if (responseText.startsWith('<')) {
        console.log('API returned HTML - stopping pagination');
        break;
      }
      
      const data = JSON.parse(responseText);
      
      if (data.list && data.list.length > 0) {
        allTags.push(...data.list);
        hasMore = data.list.length === 50; // If less than 50, we've reached the end
        page++;
        
        if (hasMore) {
          await delay(1500); // Longer delay between paginated requests
        }
      } else {
        hasMore = false;
      }
    }
    
    console.log(`\n📊 Total issue tags collected: ${allTags.length}`);
    
    // Search for WCAG-related tags
    const wcagTags = allTags.filter(term => 
      term.name && (
        term.name.toLowerCase().includes('wcag') ||
        term.name.toLowerCase().includes('accessibility') ||
        term.name.toLowerCase().includes('a11y') ||
        term.name.toLowerCase().includes('contrast') ||
        term.name.toLowerCase().includes('screen reader') ||
        term.name.toLowerCase().includes('keyboard') ||
        term.name.toLowerCase().includes('aria') ||
        term.name.toLowerCase().includes('focus')
      )
    );
    
    console.log(`\n🎯 Found ${wcagTags.length} WCAG/Accessibility related tags:`);
    console.log('================================================');
    
    wcagTags.forEach((tag, index) => {
      console.log(`${index + 1}. ${tag.name} (ID: ${tag.tid})`);
      if (tag.description) {
        console.log(`   Description: ${tag.description}`);
      }
    });
    
    // Look specifically for wcag211
    const wcag211Tag = allTags.find(term => 
      term.name && term.name.toLowerCase() === 'wcag211'
    );
    
    if (wcag211Tag) {
      console.log(`\n✅ Found "wcag211" tag! (ID: ${wcag211Tag.tid})`);
      
      const apiUrl = `https://www.drupal.org/api-d7/node.json?type=project_issue&taxonomy_vocabulary_9=${wcag211Tag.tid}`;
      const humanUrl = `https://www.drupal.org/project/issues/search?issue_tags=${wcag211Tag.name}`;
      
      console.log(`\n🔗 API URL for issues tagged with "wcag211":`);
      console.log(apiUrl);
      
      console.log(`\n🌐 Human-readable Drupal.org search URL:`);
      console.log(humanUrl);
      
      return wcag211Tag;
    } else {
      console.log(`\n❌ "wcag211" tag not found among ${allTags.length} total tags`);
      
      // Show similar WCAG tags
      const wcag2Tags = allTags.filter(term => 
        term.name && term.name.toLowerCase().includes('wcag2')
      );
      
      if (wcag2Tags.length > 0) {
        console.log(`\n🔍 Found these WCAG 2.x related tags:`);
        wcag2Tags.forEach(tag => {
          console.log(`- ${tag.name} (ID: ${tag.tid})`);
        });
      }
      
      return null;
    }
    
  } catch (error) {
    console.error('Error fetching all issue tags:', error.message);
    return null;
  }
}

async function searchWCAGIssuesRSS(wcagCriteria = 'wcag131') {
  try {
    console.log(`\n🎯 Searching for WCAG issues via RSS feed: ${wcagCriteria}`);
    console.log('=========================================================');
    
    // Longer initial delay to reduce rate limiting
    await delay(2000);
    
    // Build RSS URL for the specific WCAG criteria
    const rssUrl = `https://www.drupal.org/project/issues/search/rss?status%5B0%5D=Open&issue_tags_op=%3D&issue_tags=${wcagCriteria}`;
    
    console.log(`🔗 RSS Feed URL:`);
    console.log(rssUrl);
    
    console.log(`\n🌐 Human-readable search URL:`);
    console.log(`https://www.drupal.org/project/issues/search?status%5BOpen%5D=Open&issue_tags=${wcagCriteria}`);
    
    // Fetch the RSS feed with timeout and retry - more conservative
    const res = await fetchWithTimeout(rssUrl, {
      headers: {
        'Accept': 'application/rss+xml, application/xml, text/xml',
        'Cache-Control': 'no-cache'
      }
    }, 20000, 1); // 20s timeout, only 1 retry to avoid hammering
    
    if (!res.ok) {
      if (res.status === 403) {
        console.log(`🚫 Access denied (403) - likely rate limiting or bot detection`);
        console.log(`💡 Try accessing manually: https://www.drupal.org/project/issues/search?status%5BOpen%5D=Open&issue_tags=${wcagCriteria}`);
      } else {
        console.log(`❌ HTTP Error: ${res.status} ${res.statusText}`);
      }
      return null;
    }
    
    const rssText = await res.text();
    
    if (rssText.includes('<rss')) {
      console.log(`\n✅ Successfully fetched RSS feed for "${wcagCriteria}" issues`);
      
      // Parse basic info from RSS (simple parsing, not full XML)
      const items = rssText.split('<item>').slice(1); // Remove first split which is before any <item>
      
      console.log(`📊 Found ${items.length} open issues tagged with "${wcagCriteria}"`);
      
      const parsedIssues = [];
      
      if (items.length > 0) {
        console.log(`\n📋 First 10 issues:`);
        console.log('==================');
        
        items.forEach((item, index) => {
          // Extract title, link, description, and publication date
          const titleMatch = item.match(/<title>(.*?)<\/title>/);
          const linkMatch = item.match(/<link>(.*?)<\/link>/);
          const descMatch = item.match(/<description>(.*?)<\/description>/s);
          const pubDateMatch = item.match(/<pubDate>(.*?)<\/pubDate>/);
          
          if (titleMatch && linkMatch) {
            const title = titleMatch[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
            const link = linkMatch[1];
            const description = descMatch ? descMatch[1].replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').trim() : '';
            const pubDate = pubDateMatch ? pubDateMatch[1] : '';
            
            // Extract issue ID from link
            const issueIdMatch = link.match(/\/(\d+)$/);
            const issueId = issueIdMatch ? issueIdMatch[1] : '';
            
            parsedIssues.push({
              wcagCriteria,
              wcagCriteriaName: getWCAGCriteriaName(wcagCriteria),
              conformanceLevel: getConformanceLevel(wcagCriteria),
              issueId,
              title,
              link,
              description: description.substring(0, 500), // Limit description length
              pubDate
            });
            
            if (index < 10) {
              console.log(`${index + 1}. ${title}`);
              console.log(`   🔗 ${link}`);
              console.log('');
            }
          }
        });
        
        if (items.length > 10) {
          console.log(`... and ${items.length - 10} more issues`);
        }
      }
      
      return {
        criteria: wcagCriteria,
        count: items.length,
        rssUrl,
        issues: parsedIssues
      };
      
    } else {
      console.log(`❌ Invalid RSS response or no issues found for "${wcagCriteria}"`);
      return null;
    }
    
  } catch (error) {
    console.error(`Error fetching RSS for ${wcagCriteria}:`, error.message);
    return null;
  }
}

async function searchMultipleWCAGCriteria() {
  console.log('\n🔍 Searching Multiple WCAG Criteria');
  console.log('====================================');
  
  const criteriaList = [
    'wcag131', // Info and Relationships
    'wcag211', // Keyboard
    'wcag111', // Non-text Content  
    'wcag221', // On Focus
    'wcag241', // Parsing
    'wcag321', // On Input
    'wcag411', // Parsing
    'accessibility', // General accessibility
    'a11y', // Accessibility abbreviation
    'screenreader', // Screen reader
    'keyboard', // Keyboard navigation
    'aria' // ARIA attributes
  ];
  
  console.log(`Searching for issues tagged with: ${criteriaList.join(', ')}`);
  console.log(`\nNote: This will make multiple API calls with delays to respect rate limits`);
  
  const results = [];
  
  for (const criteria of criteriaList) {
    console.log(`\n--- Searching: ${criteria} ---`);
    const result = await searchWCAGIssuesRSS(criteria);
    if (result && result.count > 0) {
      results.push(result);
    }
    
    // Longer delay between different searches
    await delay(3000);
  }
  
  console.log(`\n📊 Summary of WCAG/Accessibility Issues:`);
  console.log('=====================================');
  
  if (results.length > 0) {
    let totalIssues = 0;
    results.forEach(result => {
      console.log(`${result.criteria}: ${result.count} open issues`);
      totalIssues += result.count;
    });
    
    console.log(`\n🎯 Total unique WCAG/accessibility issues found: ${totalIssues}`);
    console.log(`(Note: There may be overlap between different search terms)`);
    
    console.log(`\n🔗 Quick Links:`);
    results.forEach(result => {
      console.log(`${result.criteria}: https://www.drupal.org/project/issues/search?status%5BOpen%5D=Open&issue_tags=${result.criteria}`);
    });
    
  } else {
    console.log(`No WCAG/accessibility issues found with the searched criteria.`);
  }
  
  return results;
}

async function searchAllWCAG22Criteria() {
  console.log('\n🎯 Searching for ALL WCAG 2.2 Success Criteria Issues');
  console.log('=====================================================');
  
  // Complete list of ALL WCAG 2.2 Success Criteria (including all 4.x)
  const wcag22Criteria = [
    // Level A
    'wcag111', // Non-text Content
    'wcag121', // Audio-only and Video-only (Prerecorded)
    'wcag122', // Captions (Prerecorded)
    'wcag123', // Audio Description or Media Alternative (Prerecorded)
    'wcag131', // Info and Relationships
    'wcag132', // Meaningful Sequence
    'wcag133', // Sensory Characteristics
    'wcag141', // Use of Color
    'wcag142', // Audio Control
    'wcag211', // Keyboard
    'wcag212', // No Keyboard Trap
    'wcag221', // Timing Adjustable
    'wcag222', // Pause, Stop, Hide
    'wcag231', // Three Flashes or Below Threshold
    'wcag241', // Bypass Blocks
    'wcag242', // Page Titled
    'wcag243', // Focus Order
    'wcag244', // Link Purpose (In Context)
    'wcag311', // Language of Page
    'wcag312', // Language of Parts
    'wcag321', // On Focus
    'wcag322', // On Input
    'wcag331', // Error Identification
    'wcag332', // Labels or Instructions
    'wcag411', // Parsing
    'wcag412', // Name, Role, Value
    'wcag413', // Status Messages
    
    // Level AA
    'wcag124', // Captions (Live)
    'wcag125', // Audio Description (Prerecorded)
    'wcag143', // Contrast (Minimum)
    'wcag144', // Resize text
    'wcag145', // Images of Text
    'wcag213', // Character Key Shortcuts
    'wcag223', // No Timing
    'wcag224', // Interruptions
    'wcag225', // Re-authenticating
    'wcag226', // Timeouts
    'wcag232', // Three Flashes
    'wcag245', // Section Headings
    'wcag246', // Focus Visible
    'wcag313', // Unusual Words
    'wcag314', // Abbreviations
    'wcag315', // Reading Level
    'wcag316', // Pronunciation
    'wcag323', // Error Suggestion
    'wcag324', // Error Prevention (Legal, Financial, Data)
    'wcag325', // Help
    'wcag326', // Redundant Entry
    'wcag327', // Accessible Authentication (Minimum)
    
    // Level AAA
    'wcag126', // Sign Language (Prerecorded)
    'wcag127', // Extended Audio Description (Prerecorded)
    'wcag128', // Media Alternative (Prerecorded)
    'wcag129', // Audio-only (Live)
    'wcag134', // Orientation
    'wcag135', // Identify Input Purpose
    'wcag146', // Contrast (Enhanced)
    'wcag147', // Low or No Background Audio
    'wcag148', // Visual Presentation
    'wcag149', // Images of Text (No Exception)
    'wcag1410', // Reflow
    'wcag1411', // Non-text Contrast
    'wcag1412', // Text Spacing
    'wcag1413', // Content on Hover or Focus
    'wcag214', // Character Key Shortcuts
    'wcag227', // Focus Not Obscured (Minimum)
    'wcag228', // Focus Not Obscured (Enhanced)
    'wcag229', // Focus Appearance
    'wcag233', // Animation from Interactions
    'wcag247', // Focus Not Obscured (Minimum)
    'wcag248', // Focus Not Obscured (Enhanced)
    'wcag249', // Focus Appearance
    'wcag2410', // Section Headings
    'wcag317', // Change on Request
    'wcag328', // Accessible Authentication (Enhanced)
    'wcag2411', // Dragging Movements
    'wcag2412', // Pointer Cancellation
    'wcag2413', // Label in Name
    'wcag2414', // Motion Actuation
    'wcag2415', // Target Size (Minimum)
    'wcag2416', // Target Size (Enhanced)
    'wcag2417', // Concurrent Input Mechanisms
  ];
  
  console.log(`🔍 Searching ${wcag22Criteria.length} WCAG 2.2 Success Criteria...`);
  console.log(`⏱️  This will take several minutes due to rate limiting.`);
  console.log(`📝 Results will be saved as we go...\n`);
  
  const results = [];
  let totalIssues = 0;
  let allIssues = []; // Store all individual issues for CSV export
  
  for (let i = 0; i < wcag22Criteria.length; i++) {
    const criteria = wcag22Criteria[i];
    const progress = `[${i + 1}/${wcag22Criteria.length}]`;
    
    console.log(`${progress} Searching: ${criteria}...`);
    
    try {
      const result = await searchWCAGIssuesRSS(criteria);
      
      if (result && result.count > 0) {
        results.push(result);
        totalIssues += result.count;
        
        // Add all issues to the master list for CSV export
        if (result.issues && result.issues.length > 0) {
          allIssues.push(...result.issues);
        }
        
        console.log(`✅ Found ${result.count} issues for ${criteria}`);
      } else {
        console.log(`⚪ No issues found for ${criteria}`);
      }
    } catch (error) {
      console.log(`❌ Error searching ${criteria}: ${error.message}`);
    }
    
    // Rate limiting - much longer delays to avoid bot detection
    if ((i + 1) % 3 === 0) {
      console.log(`⏸️  Pausing for 10 seconds after ${i + 1} requests...`);
      await delay(10000);
    } else {
      await delay(5000); // Longer base delay
    }
  }
  
  // Generate CSV export
  if (allIssues.length > 0) {
    await generateCSVReport(allIssues);
  }
  
    console.log(`\n📊 CSV Report Summary:`);
    console.log('=======================');
    if (allIssues.length > 0) {
      console.log(`✅ CSV file generated: ${CSV_OUTPUT_FILE}`);
      console.log(`📊 Total issues exported: ${allIssues.length}`);
      console.log(`📁 File size: ${fs.statSync(CSV_OUTPUT_FILE).size} bytes`);
      
      const summaryStats = generateSummaryStats(allIssues);
      console.log(`🎯 Unique WCAG criteria with issues: ${summaryStats.uniqueCriteria}`);
      console.log(`📈 Issues by level: A=${summaryStats.levelA}, AA=${summaryStats.levelAA}, AAA=${summaryStats.levelAAA}`);
    } else {
      console.log(`ℹ️  No issues found - CSV file not generated`);
    }
  
  if (results.length > 0) {
    console.log(`\n🎯 Found issues for ${results.length} different WCAG 2.2 criteria`);
    console.log(`📈 Total issues across all criteria: ${totalIssues}`);
    console.log(`(Note: Some issues may be tagged with multiple criteria)`);
    
    // Sort results by issue count (descending)
    const sortedResults = results.sort((a, b) => b.count - a.count);
    
    console.log(`\n📋 Issues by Success Criteria (sorted by count):`);
    console.log('===============================================');
    
    sortedResults.forEach((result, index) => {
      const criteriaName = getWCAGCriteriaName(result.criteria);
      console.log(`${index + 1}. ${result.criteria.toUpperCase()}: ${result.count} issues - ${criteriaName}`);
    });
    
    console.log(`\n🔗 Direct RSS Feed Links:`);
    console.log('=========================');
    sortedResults.forEach(result => {
      console.log(`${result.criteria}: ${result.rssUrl}`);
    });
    
    console.log(`\n🌐 Human-readable Search Links:`);
    console.log('===============================');
    sortedResults.forEach(result => {
      console.log(`${result.criteria}: https://www.drupal.org/project/issues/search?status%5BOpen%5D=Open&issue_tags=${result.criteria}`);
    });
    
    // Breakdown by conformance level
    const levelA = sortedResults.filter(r => isLevelA(r.criteria));
    const levelAA = sortedResults.filter(r => isLevelAA(r.criteria));
    const levelAAA = sortedResults.filter(r => isLevelAAA(r.criteria));
    
    console.log(`\n📊 Breakdown by Conformance Level:`);
    console.log('==================================');
    console.log(`Level A: ${levelA.length} criteria with issues (${levelA.reduce((sum, r) => sum + r.count, 0)} total issues)`);
    console.log(`Level AA: ${levelAA.length} criteria with issues (${levelAA.reduce((sum, r) => sum + r.count, 0)} total issues)`);
    console.log(`Level AAA: ${levelAAA.length} criteria with issues (${levelAAA.reduce((sum, r) => sum + r.count, 0)} total issues)`);
    
  } else {
    console.log(`❌ No WCAG 2.2 Success Criteria issues found.`);
  }
  
  return results;
}

function getWCAGCriteriaName(criteria) {
  const names = {
    'wcag111': 'Non-text Content',
    'wcag121': 'Audio-only and Video-only (Prerecorded)',
    'wcag122': 'Captions (Prerecorded)',
    'wcag123': 'Audio Description or Media Alternative (Prerecorded)',
    'wcag131': 'Info and Relationships',
    'wcag132': 'Meaningful Sequence',
    'wcag133': 'Sensory Characteristics',
    'wcag141': 'Use of Color',
    'wcag142': 'Audio Control',
    'wcag211': 'Keyboard',
    'wcag212': 'No Keyboard Trap',
    'wcag221': 'Timing Adjustable',
    'wcag222': 'Pause, Stop, Hide',
    'wcag231': 'Three Flashes or Below Threshold',
    'wcag241': 'Bypass Blocks',
    'wcag242': 'Page Titled',
    'wcag243': 'Focus Order',
    'wcag244': 'Link Purpose (In Context)',
    'wcag311': 'Language of Page',
    'wcag312': 'Language of Parts',
    'wcag321': 'On Focus',
    'wcag322': 'On Input',
    'wcag331': 'Error Identification',
    'wcag332': 'Labels or Instructions',
    'wcag411': 'Parsing',
    'wcag412': 'Name, Role, Value',
    'wcag413': 'Status Messages',
    'wcag124': 'Captions (Live)',
    'wcag125': 'Audio Description (Prerecorded)',
    'wcag143': 'Contrast (Minimum)',
    'wcag144': 'Resize text',
    'wcag145': 'Images of Text',
    'wcag213': 'Character Key Shortcuts',
    'wcag223': 'No Timing',
    'wcag224': 'Interruptions',
    'wcag225': 'Re-authenticating',
    'wcag226': 'Timeouts',
    'wcag232': 'Three Flashes',
    'wcag245': 'Section Headings',
    'wcag246': 'Focus Visible',
    'wcag313': 'Unusual Words',
    'wcag314': 'Abbreviations',
    'wcag315': 'Reading Level',
    'wcag316': 'Pronunciation',
    'wcag323': 'Error Suggestion',
    'wcag324': 'Error Prevention (Legal, Financial, Data)',
    'wcag325': 'Help',
    'wcag326': 'Redundant Entry',
    'wcag327': 'Accessible Authentication (Minimum)',
    'wcag126': 'Sign Language (Prerecorded)',
    'wcag127': 'Extended Audio Description (Prerecorded)',
    'wcag128': 'Media Alternative (Prerecorded)',
    'wcag129': 'Audio-only (Live)',
    'wcag134': 'Orientation',
    'wcag135': 'Identify Input Purpose',
    'wcag146': 'Contrast (Enhanced)',
    'wcag147': 'Low or No Background Audio',
    'wcag148': 'Visual Presentation',
    'wcag149': 'Images of Text (No Exception)',
    'wcag1410': 'Reflow',
    'wcag1411': 'Non-text Contrast',
    'wcag1412': 'Text Spacing',
    'wcag1413': 'Content on Hover or Focus',
    'wcag214': 'Character Key Shortcuts',
    'wcag227': 'Focus Not Obscured (Minimum)',
    'wcag228': 'Focus Not Obscured (Enhanced)',
    'wcag229': 'Focus Appearance',
    'wcag233': 'Animation from Interactions',
    'wcag247': 'Focus Not Obscured (Minimum)',
    'wcag248': 'Focus Not Obscured (Enhanced)',
    'wcag249': 'Focus Appearance',
    'wcag2410': 'Section Headings',
    'wcag317': 'Change on Request',
    'wcag328': 'Accessible Authentication (Enhanced)',
    'wcag2411': 'Dragging Movements',
    'wcag2412': 'Pointer Cancellation',
    'wcag2413': 'Label in Name',
    'wcag2414': 'Motion Actuation',
    'wcag2415': 'Target Size (Minimum)',
    'wcag2416': 'Target Size (Enhanced)',
    'wcag2417': 'Concurrent Input Mechanisms'
  };
  
  return names[criteria] || 'Unknown Criteria';
}

function isLevelA(criteria) {
  const levelA = ['wcag111', 'wcag121', 'wcag122', 'wcag123', 'wcag131', 'wcag132', 'wcag133', 'wcag141', 'wcag142', 'wcag211', 'wcag212', 'wcag221', 'wcag222', 'wcag231', 'wcag241', 'wcag242', 'wcag243', 'wcag244', 'wcag311', 'wcag312', 'wcag321', 'wcag322', 'wcag331', 'wcag332', 'wcag411', 'wcag412', 'wcag413'];
  return levelA.includes(criteria);
}

function isLevelAA(criteria) {
  const levelAA = ['wcag124', 'wcag125', 'wcag143', 'wcag144', 'wcag145', 'wcag213', 'wcag223', 'wcag224', 'wcag225', 'wcag226', 'wcag232', 'wcag245', 'wcag246', 'wcag313', 'wcag314', 'wcag315', 'wcag316', 'wcag323', 'wcag324', 'wcag325', 'wcag326', 'wcag327'];
  return levelAA.includes(criteria);
}

function isLevelAAA(criteria) {
  // For simplicity, anything not Level A or AA is considered AAA
  return !isLevelA(criteria) && !isLevelAA(criteria);
}

async function generateCSVReport(allIssues) {
  try {
    console.log(`\n📊 Generating CSV Report...`);
    console.log(`📝 Total issues to export: ${allIssues.length}`);
    
    // Create CSV headers
    const headers = [
      'WCAG Criteria',
      'WCAG Criteria Name', 
      'Conformance Level',
      'Issue ID',
      'Issue Title',
      'Issue URL',
      'Description',
      'Publication Date',
      'RSS Feed URL',
      'Search URL'
    ];
    
    // Create CSV content
    let csvContent = headers.join(',') + '\n';
    
    // Sort issues by WCAG criteria for better organization
    allIssues.sort((a, b) => a.wcagCriteria.localeCompare(b.wcagCriteria));
    
    allIssues.forEach(issue => {
      const row = [
        escapeCSV(issue.wcagCriteria),
        escapeCSV(issue.wcagCriteriaName),
        escapeCSV(issue.conformanceLevel),
        escapeCSV(issue.issueId),
        escapeCSV(issue.title),
        escapeCSV(issue.link),
        escapeCSV(issue.description),
        escapeCSV(issue.pubDate),
        escapeCSV(`https://www.drupal.org/project/issues/search/rss?status%5B0%5D=Open&issue_tags_op=%3D&issue_tags=${issue.wcagCriteria}`),
        escapeCSV(`https://www.drupal.org/project/issues/search?status%5BOpen%5D=Open&issue_tags=${issue.wcagCriteria}`)
      ];
      csvContent += row.join(',') + '\n';
    });
    
    // Write CSV file
    fs.writeFileSync(CSV_OUTPUT_FILE, csvContent, 'utf8');
    
    console.log(`✅ CSV report generated successfully!`);
    console.log(`📁 File location: ${CSV_OUTPUT_FILE}`);
    console.log(`📊 Total rows: ${allIssues.length + 1} (including header)`);
    
    // Generate summary statistics
    const summaryStats = generateSummaryStats(allIssues);
    console.log(`\n📈 Summary Statistics:`);
    console.log(`===================`);
    console.log(`• Unique WCAG Criteria with issues: ${summaryStats.uniqueCriteria}`);
    console.log(`• Level A issues: ${summaryStats.levelA}`);
    console.log(`• Level AA issues: ${summaryStats.levelAA}`);
    console.log(`• Level AAA issues: ${summaryStats.levelAAA}`);
    
  } catch (error) {
    console.error('❌ Error generating CSV report:', error.message);
  }
}

function escapeCSV(field) {
  if (field === null || field === undefined) {
    return '';
  }
  
  // Convert to string and handle quotes and commas
  const str = String(field);
  
  // If the field contains quotes, commas, or newlines, wrap in quotes and escape internal quotes
  if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  
  return str;
}

function generateSummaryStats(allIssues) {
  const uniqueCriteria = new Set(allIssues.map(issue => issue.wcagCriteria)).size;
  const levelA = allIssues.filter(issue => issue.conformanceLevel === 'Level A').length;
  const levelAA = allIssues.filter(issue => issue.conformanceLevel === 'Level AA').length;
  const levelAAA = allIssues.filter(issue => issue.conformanceLevel === 'Level AAA').length;
  
  return { uniqueCriteria, levelA, levelAA, levelAAA };
}

function getConformanceLevel(criteria) {
  if (isLevelA(criteria)) return 'Level A';
  if (isLevelAA(criteria)) return 'Level AA';
  return 'Level AAA';
}

// Run the exploration
exploreAPI().catch(console.error);
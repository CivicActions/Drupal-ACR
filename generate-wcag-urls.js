// WCAG URL Generator - Creates all URLs for manual access
const fs = require('fs');
const path = require('path');

// All WCAG 2.2 Success Criteria
const wcag22Criteria = [
  // Level A
  'wcag111', 'wcag121', 'wcag122', 'wcag123', 'wcag131', 'wcag132', 'wcag133', 
  'wcag141', 'wcag142', 'wcag211', 'wcag212', 'wcag221', 'wcag222', 'wcag231', 
  'wcag241', 'wcag242', 'wcag243', 'wcag244', 'wcag311', 'wcag312', 'wcag321', 
  'wcag322', 'wcag331', 'wcag332', 'wcag411', 'wcag412', 'wcag413',
  
  // Level AA
  'wcag124', 'wcag125', 'wcag143', 'wcag144', 'wcag145', 'wcag213', 'wcag223', 
  'wcag224', 'wcag225', 'wcag226', 'wcag232', 'wcag245', 'wcag246', 'wcag313', 
  'wcag314', 'wcag315', 'wcag316', 'wcag323', 'wcag324', 'wcag325', 'wcag326', 'wcag327',
  
  // Level AAA
  'wcag126', 'wcag127', 'wcag128', 'wcag129', 'wcag134', 'wcag135', 'wcag146', 
  'wcag147', 'wcag148', 'wcag149', 'wcag1410', 'wcag1411', 'wcag1412', 'wcag1413', 
  'wcag214', 'wcag227', 'wcag228', 'wcag229', 'wcag233', 'wcag247', 'wcag248', 
  'wcag249', 'wcag2410', 'wcag317', 'wcag328', 'wcag2411', 'wcag2412', 'wcag2413', 
  'wcag2414', 'wcag2415', 'wcag2416', 'wcag2417'
];

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

function getConformanceLevel(criteria) {
  const levelA = ['wcag111', 'wcag121', 'wcag122', 'wcag123', 'wcag131', 'wcag132', 'wcag133', 'wcag141', 'wcag142', 'wcag211', 'wcag212', 'wcag221', 'wcag222', 'wcag231', 'wcag241', 'wcag242', 'wcag243', 'wcag244', 'wcag311', 'wcag312', 'wcag321', 'wcag322', 'wcag331', 'wcag332', 'wcag411', 'wcag412', 'wcag413'];
  const levelAA = ['wcag124', 'wcag125', 'wcag143', 'wcag144', 'wcag145', 'wcag213', 'wcag223', 'wcag224', 'wcag225', 'wcag226', 'wcag232', 'wcag245', 'wcag246', 'wcag313', 'wcag314', 'wcag315', 'wcag316', 'wcag323', 'wcag324', 'wcag325', 'wcag326', 'wcag327'];
  
  if (levelA.includes(criteria)) return 'Level A';
  if (levelAA.includes(criteria)) return 'Level AA';
  return 'Level AAA';
}

function generateURLList() {
  console.log('🔗 Generating WCAG URL List for Manual Access');
  console.log('==============================================\n');
  
  const urlList = [];
  const csvRows = [];
  
  // CSV headers
  csvRows.push(['WCAG Criteria', 'WCAG Criteria Name', 'Conformance Level', 'Search URL', 'RSS URL', 'Issue Count', 'Notes']);
  
  wcag22Criteria.forEach(criteria => {
    const name = getWCAGCriteriaName(criteria);
    const level = getConformanceLevel(criteria);
    const searchUrl = `https://www.drupal.org/project/issues/search?status%5BOpen%5D=Open&issue_tags=${criteria}`;
    const rssUrl = `https://www.drupal.org/project/issues/search/rss?status%5B0%5D=Open&issue_tags_op=%3D&issue_tags=${criteria}`;
    
    urlList.push({
      criteria,
      name,
      level,
      searchUrl,
      rssUrl
    });
    
    // Add to CSV with empty count and notes for manual filling
    csvRows.push([criteria, name, level, searchUrl, rssUrl, '', '']);
  });
  
  return { urlList, csvRows };
}

function generateFiles() {
  const { urlList, csvRows } = generateURLList();
  
  // Generate HTML file for easy clicking
  let htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>WCAG 2.2 Success Criteria - Drupal.org Issues</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .criteria { margin: 10px 0; padding: 10px; border: 1px solid #ddd; border-radius: 5px; }
        .criteria h3 { margin: 0 0 5px 0; color: #0073aa; }
        .criteria p { margin: 5px 0; font-size: 14px; color: #666; }
        .level-a { border-left: 4px solid #28a745; }
        .level-aa { border-left: 4px solid #ffc107; }
        .level-aaa { border-left: 4px solid #dc3545; }
        .urls { margin: 5px 0; }
        .urls a { display: inline-block; margin: 5px 10px 5px 0; padding: 5px 10px; background: #0073aa; color: white; text-decoration: none; border-radius: 3px; font-size: 12px; }
        .urls a:hover { background: #005a87; }
        .summary { background: #f8f9fa; padding: 15px; border-radius: 5px; margin-bottom: 20px; }
    </style>
</head>
<body>
    <div class="summary">
        <h1>WCAG 2.2 Success Criteria - Drupal.org Issues</h1>
        <p><strong>Total Criteria:</strong> ${urlList.length}</p>
        <p><strong>Level A:</strong> ${urlList.filter(u => u.level === 'Level A').length}</p>
        <p><strong>Level AA:</strong> ${urlList.filter(u => u.level === 'Level AA').length}</p>
        <p><strong>Level AAA:</strong> ${urlList.filter(u => u.level === 'Level AAA').length}</p>
        <p><strong>Instructions:</strong> Click the "Search" links to view issues in your browser. The RSS links can be used for automated processing if bot detection is resolved.</p>
    </div>
`;

  urlList.forEach(item => {
    const levelClass = item.level.toLowerCase().replace(' ', '-');
    htmlContent += `
    <div class="criteria ${levelClass}">
        <h3>${item.criteria.toUpperCase()}: ${item.name}</h3>
        <p><strong>Conformance Level:</strong> ${item.level}</p>
        <div class="urls">
            <a href="${item.searchUrl}" target="_blank">🔍 Search Issues</a>
            <a href="${item.rssUrl}" target="_blank">📡 RSS Feed</a>
        </div>
    </div>`;
  });
  
  htmlContent += `
</body>
</html>`;
  
  // Write HTML file
  fs.writeFileSync('wcag-urls.html', htmlContent);
  
  // Generate CSV template
  const csvContent = csvRows.map(row => 
    row.map(field => {
      // Escape CSV fields that contain commas or quotes
      if (typeof field === 'string' && (field.includes(',') || field.includes('"'))) {
        return '"' + field.replace(/"/g, '""') + '"';
      }
      return field;
    }).join(',')
  ).join('\n');
  
  // Create results directory if it doesn't exist
  const resultsDir = 'results';
  if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true });
  }
  
  // Generate timestamp for filename (YYYY-MM-DD_HH-MM format)
  const now = new Date();
  const timestamp = now.toISOString().slice(0, 16).replace(/:/g, '-').replace('T', '_');
  
  fs.writeFileSync(path.join(resultsDir, `wcag-template_${timestamp}.csv`), csvContent);
  
  // Generate markdown file
  let markdownContent = `# WCAG 2.2 Success Criteria - Drupal.org Issues

## Summary
- **Total Criteria:** ${urlList.length}
- **Level A:** ${urlList.filter(u => u.level === 'Level A').length}
- **Level AA:** ${urlList.filter(u => u.level === 'Level AA').length}  
- **Level AAA:** ${urlList.filter(u => u.level === 'Level AAA').length}

## Instructions
Since automated access is being blocked by bot detection, you can:
1. Use the HTML file (wcag-urls.html) to manually click through each criteria
2. Use the CSV template (wcag-template.csv) to track your findings
3. Copy URLs from the markdown table below

## All WCAG 2.2 Success Criteria

| Criteria | Name | Level | Search URL | RSS URL |
|----------|------|-------|------------|---------|
`;

  urlList.forEach(item => {
    markdownContent += `| ${item.criteria.toUpperCase()} | ${item.name} | ${item.level} | [Search](${item.searchUrl}) | [RSS](${item.rssUrl}) |\n`;
  });
  
  fs.writeFileSync('wcag-urls.md', markdownContent);
  
  console.log('✅ Generated files:');
  console.log('📄 wcag-urls.html - Interactive HTML page for manual browsing');
  console.log('📊 wcag-template.csv - CSV template for tracking results');
  console.log('📝 wcag-urls.md - Markdown reference with all URLs');
  console.log('\n💡 Recommendation: Open wcag-urls.html in your browser and manually check criteria with issues.');
  console.log('💡 Then populate the CSV template with your findings.');
}

generateFiles();

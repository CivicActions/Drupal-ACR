// Convert consolidated WCAG ACR CSV to OpenACR YAML format
import fs from 'fs';
import path from 'path';
import csv from 'csv-parser';

// Basic YAML helper functions
function escapeYAML(str) {
  if (!str) return '""';
  
  // Convert to string and handle basic escaping
  const cleaned = String(str)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r');
  
  // If it contains special characters, quotes, or newlines, wrap in quotes
  if (cleaned.includes(':') || cleaned.includes('#') || cleaned.includes('\n') || 
      cleaned.includes('\r') || cleaned.includes('"') || cleaned.includes('|') ||
      cleaned.trim() !== cleaned || cleaned.includes('  ')) {
    return `"${cleaned}"`;
  }
  
  return cleaned;
}

function formatYAMLMultiline(text, indent = '  ') {
  if (!text) return '""';
  
  // For longer text, use YAML folded block scalar
  if (text.length > 80 || text.includes('\n')) {
    return `>-\n${indent}  ${text.replace(/\n/g, `\n${indent}  `)}`;
  }
  
  return escapeYAML(text);
}

// Parse CSV file using proper CSV parser
function parseCSV(csvFilePath) {
  return new Promise((resolve, reject) => {
    const results = [];
    fs.createReadStream(csvFilePath)
      .pipe(csv())
      .on('data', (data) => results.push(data))
      .on('end', () => resolve(results))
      .on('error', (error) => reject(error));
  });
}

// Convert ACR assessment to OpenACR adherence level
function convertAssessmentToAdherence(assessment) {
  const mapping = {
    'SUPPORTED': 'supports',
    'PARTIALLY_SUPPORTED': 'partially-supports',
    'NOT_SUPPORTED': 'does-not-support',
    'NOT_APPLICABLE': 'not-applicable',
    'REQUIRES_REVIEW': 'not-evaluated',
    'ERROR': 'not-evaluated'
  };
  
  return mapping[assessment] || 'not-evaluated';
}

// Convert WCAG SC number format (e.g., 'wcag111' to '1.1.1')
function convertWCAGFormat(wcagSC) {
  if (!wcagSC || !wcagSC.startsWith('wcag')) {
    return wcagSC;
  }
  
  // Remove 'wcag' prefix and convert to dotted format
  const numbers = wcagSC.slice(4); // Remove 'wcag'
  
  // Handle specific known patterns
  const specialMappings = {
    '1410': '1.4.10',
    '1411': '1.4.11',
    '1412': '1.4.12',
    '2411': '2.4.11',
    '233': '2.3.3',
    '248': '2.4.8',
    '249': '2.4.9',
    '255': '2.5.5', // Map 255 to 2.5.5 (Level AAA)
    '258': '2.5.8', // Fixed: 258 should map to 2.5.8, not 2.5.5
    '325': '3.2.5',
    '336': '3.3.6'
  };
  
  if (specialMappings[numbers]) {
    return specialMappings[numbers];
  }
  
  // Handle standard patterns
  if (numbers.length === 3) {
    // Pattern: 111 -> 1.1.1
    return `${numbers[0]}.${numbers[1]}.${numbers[2]}`;
  } else if (numbers.length === 4) {
    // Pattern: 1410 -> 1.4.10 (handled above)
    // For other 4-digit patterns, try different splits
    if (numbers.startsWith('1') || numbers.startsWith('2') || numbers.startsWith('3') || numbers.startsWith('4')) {
      // Try x.y.zz format first
      const first = numbers[0];
      const second = numbers[1];
      const third = numbers.slice(2);
      return `${first}.${second}.${third}`;
    }
  }
  
  // Fallback for unusual formats
  console.warn(`⚠️  Unable to convert WCAG format: ${wcagSC}`);
  return wcagSC;
}

// WCAG Success Criteria positive accessibility statements
// These describe what good accessibility looks like for each criterion
const wcagPositiveStatements = {
  // WCAG Level A criteria
  '1.1.1': "Images and form elements have text alternatives that adequately describe the purpose and meaning",
  '1.2.1': "Prerecorded audio and video are presented with captions, transcripts, or links to equivalent content",
  '1.2.2': "Audio recordings and videos with sound have synchronized captions",
  '1.2.3': "Audio description is provided for pre-recorded video",
  '1.3.1': "The meaning conveyed by visual elements is the same when communicated programmatically for assistive technology users",
  '1.3.2': "Keyboard users navigate the page in the same order the content is presented (top down, left to right)",
  '1.3.3': "Descriptions and instructions don't rely on visual cues, like color or position",
  '1.4.1': "Links and form elements use more than color (underlines, outlines) to convey state",
  '1.4.2': "Users can pause or stop automated audio/video and control its volume in the UI",
  '2.1.1': "Interactive elements are navigable and usable with keyboard commands",
  '2.1.2': "Users can move focus to/from interactive elements with keyboard alone",
  '2.1.4': "Custom character shortcuts are scoped to a focus event, use modifier keys, or can be customized or disabled",
  '2.2.1': "Users can turn off or modify timers or time limits",
  '2.2.2': "Users can pause animations or auto-updating content",
  '2.3.1': "Pages don't have flashing content that exceeds flashing content thresholds",
  '2.4.1': "Users can skip repeated navigation elements and go straight to main content",
  '2.4.2': "Web pages have a descriptive title",
  '2.4.3': "Focusable elements appear in the same order the content is presented (top down, left to right)",
  '2.4.4': "Screen reader users can determine a link's purpose by its text and surrounding context",
  '2.5.1': "Alternative methods using tap or a click are provided for path-based gestures (scrolling, drawing, zooming the page)",
  '2.5.2': "Users can dismiss, cancel, or undo single-pointer actions",
  '2.5.3': "Interactive elements have a programmatically derived accessible name that begins with or matches its visible label",
  '2.5.4': "Motion actuation functionality can be disabled to prevent accidental triggering",
  '3.1.1': "Pages have a 'lang' attribute that identifies the main language used for content",
  '3.2.1': "No major changes to the page that could disorient users are made on focus",
  '3.2.2': "No major changes to the page that could disorient users are made when a field changes value, unless the change is expected",
  '3.3.1': "Error messages are provided in text",
  '3.3.2': "Fields for user input have text labels or instructions",
  '4.1.1': "Parsing of markup does not cause errors for assistive technologies",
  '4.1.2': "Interactive elements have a programmatically derived accessible name, role, and value/state",
  
  // WCAG Level AA criteria
  '1.2.4': "Live audio/video feeds have captions",
  '1.2.5': "Meaningful information that's not conveyed in dialogue is described in captions",
  '1.3.4': "On a mobile device, the site is fully functional whether in portrait or landscape orientation",
  '1.3.5': "Form inputs are correctly labeled for screen reader users",
  '1.4.3': "Text and links meet and often exceed minimum color contrast requirements",
  '1.4.4': "The site remains legible and fully functional when users zoom the screen by 200% or more",
  '1.4.5': "Text is only baked into an image when it needs to be, like for the site logo",
  '1.4.10': "The site uses responsive development techniques so that content and functionality are retained regardless of device or viewport size (mobile, tablet, desktop)",
  '1.4.11': "Form elements and buttons meet and often exceed minimum color contrast requirements",
  '1.4.12': "Line height, letter, paragraph, and word spacing meet size requirements relative to font size",
  '1.4.13': "Tooltips, which appear on hover and focus, persist until the user moves the pointer or focus elsewhere",
  '2.4.5': "Users can reach pages by using search, global navigation, sidebar navigation, or links within page content",
  '2.4.6': "Headings and labels are accurately described",
  '2.4.7': "Interactive elements have a visible focus state when navigating by keyboard",
  '2.4.11': "Interactive elements are at least partially visible (not obscured by other content) when focused",
  '2.5.7': "When dragging actions are required, users have an alternate, single-pointer action like tap or click to perform the same task",
  '2.5.8': "Interactive elements are at least 24x24 pixels or have sufficient space around them to prevent errant clicks, unless they're part of a sentence",
  '3.1.2': "Sections of content that do not use the main page language have a 'lang' attribute that identifies the language used",
  '3.2.3': "Navigation elements appear in the same location and order across the site",
  '3.2.4': "Interactive elements with the same function have the same name, role, and behavior",
  '3.3.3': "Corrective actions are suggested when users make an input error",
  '3.3.4': "Forms that collect user data can be reviewed and confirmed or corrected",
  '4.1.3': "Status messages are announced to users without having to focus on status message content",
  
  // WCAG Level AAA criteria
  '1.2.6': "Sign Language interpretation is provided for audio content",
  '1.2.7': "Extended audio description is provided for video content where pauses in dialogue are insufficient",
  '1.2.8': "A full text alternative is provided for pre-recorded synchronized media",
  '1.2.9': "Audio-only live content has alternative access methods",
  '1.3.6': "The purpose of user interface components can be programmatically determined",
  '1.4.6': "Text has a contrast ratio of at least 7:1 with its background",
  '1.4.7': "Audio content has minimal or no background noise to aid comprehension",
  '1.4.8': "Text presentation can be customized without loss of content or functionality",
  '1.4.9': "Images of text are used only for decoration or when essential to the information",
  '2.1.3': "All page functionality is available from a keyboard without requiring specific timings",
  '2.2.3': "Timing is not an essential part of the event or activity",
  '2.2.4': "Interruptions can be postponed or suppressed by the user",
  '2.2.5': "When a session expires, the user can continue without loss of data",
  '2.2.6': "Users are warned of the duration of inactivity that will cause data loss",
  '2.3.2': "Web pages do not contain content that flashes more than three times in any one second period",
  '2.3.3': "Animation from interactions can be disabled unless essential to functionality",
  '2.4.8': "Information about the user's location within a website is available",
  '2.4.9': "Link purpose can be identified from link text alone",
  '2.4.10': "Section headings are used to organize content",
  '2.5.5': "The size of the target for pointer inputs is at least 44 by 44 CSS pixels",
  '2.5.6': "Input mechanisms are available for users who cannot perform complex gestures",
  '3.1.3': "The meaning of unusual words, phrases, idioms, and abbreviations can be determined",
  '3.1.4': "The expansion or explanation of abbreviations can be determined",
  '3.1.5': "Reading level is lower secondary education level or supplemental content is available",
  '3.1.6': "The pronunciation of words where meanings is ambiguous can be determined",
  '3.2.5': "Changes of context are initiated only by user request or a mechanism is available to turn off such changes",
  '3.3.5': "Context-sensitive help is available",
  '3.3.6': "Error prevention mechanisms are provided for submissions that are irreversible or financial"
};

// Function to get positive accessibility statement for a WCAG criterion
function getPositiveStatement(wcagNum) {
  return wcagPositiveStatements[wcagNum] || null;
}

// WCAG Success Criteria that should be marked as Not Applicable
const naList = ['1.2.1','1.2.3','1.2.4', '1.2.5', '1.4.2', '2.1.4', '2.2.1', '2.2.2', '2.3.1', '2.5.4', '4.1.1'];

// Function to check if a WCAG criterion should be marked as N/A
function isNotApplicable(wcagNum) {
  return naList.includes(wcagNum);
}

// Generate the OpenACR YAML content
function generateOpenACR(consolidatedData) {
  const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
  
  // Load template from external file
  let templatePath = 'drupal-template.yaml';
  if (!fs.existsSync(templatePath)) {
    console.log(`⚠️  Template file not found: ${templatePath}`);
    console.log('💡 Creating default template...');
    
    // Fallback to embedded template if file doesn't exist
    const defaultTemplate = `title: Drupal Accessibility Conformance Report
product:
  name: Drupal
  version: "10"
  description: >-
    Drupal is an open source content management platform supporting a variety of
    websites ranging from personal weblogs to large community-driven websites.
author:
  name: "Your Name"
  company_name: "Your Organization"
  address: "Your Address"
  email: "your.email@example.com"
  phone: "(000) 000-0000"
  website: "https://yourorganization.com"
report_date: "\${timestamp}"
last_modified_date: "\${timestamp}"
version: 1
notes: >-
  This accessibility conformance report has been generated from automated 
  analysis of Drupal accessibility issues. The assessments are based on 
  WCAG 2.1 Level A and AA criteria. Manual verification is recommended 
  for critical assessments. Links to the issues identified are included where 
  possible to ensure that this is a living document where outstanding issues 
  are regularly reviewed for compliance.
evaluation_methods_used: >-
  Automated analysis using AI-powered assessment of accessibility issues, 
  combined with manual review of WCAG conformance. Issues were extracted 
  from accessibility audits and consolidated by WCAG Success Criteria. 
  Analysis includes review of identified accessibility barriers and user impact.
legal_disclaimer: >-
  The information herein is provided in good faith based on analysis of 
  identified accessibility issues and does not represent a legally-binding 
  claim. Please verify assessments and contact us to report any accessibility 
  errors or conformance claim errors for re-evaluation and correction, if necessary.
repository: "https://github.com/your-org/your-repo"
feedback: "mailto:your.email@example.com"
license: GPL-2.0-or-later
related_openacrs:
  - url: ""
    type: secondary
chapters:
  success_criteria_level_a:
    notes: >-
      Drupal doesn't make a strong distinction between the front-end and
      back-end accessibility. Many administration interfaces can be exposed to
      users in a more interactive site. Generally this report focuses the
      Conformance Level / Remarks and Explanations so that Web comments are
      about elements that are typically public for all users, while Authoring
      Tool is typically for authors and administrators. The goal of the
      authoring interface is to support ATAG 2.0 AA (Part A and B). The Drupal
      community strives to keep up with the latest WCAG recommendation.
    criteria:`;
    
    fs.writeFileSync(templatePath, defaultTemplate, 'utf8');
    console.log(`✅ Created default template: ${templatePath}`);
  }
  
  // Read and process template
  let yaml = fs.readFileSync(templatePath, 'utf8');
  
  // Replace timestamp placeholder
  yaml = yaml.replace(/\$\{timestamp\}/g, timestamp);
  
  // Ensure template ends with criteria: and a newline
  if (!yaml.trim().endsWith('criteria:')) {
    yaml += '\n';
  } else {
    yaml += '\n';
  }

  // Group by WCAG level (A, AA, AAA)
  const levelACriteria = [];
  const levelAACriteria = [];
  const levelAAACriteria = [];
  
  // TEMPORARY: Filter out WCAG 2.2 criteria that are not supported by OpenACR Editor
  // TODO: Remove this filtering when OpenACR Editor supports WCAG 2.2
  // WCAG 2.2 new criteria that need to be excluded:
  const wcag22Criteria = ['2.4.11', '2.4.12', '2.4.13', '2.5.7', '2.5.8', '3.2.6', '3.3.7'];
  
  consolidatedData.forEach(item => {
    const wcagNum = convertWCAGFormat(item['WCAG SC']);
    
    // TEMPORARY: Skip WCAG 2.2 criteria until OpenACR Editor supports them
    // TODO: Remove this check when WCAG 2.2 support is added to OpenACR Editor
    if (wcag22Criteria.includes(wcagNum)) {
      console.log(`⚠️  Skipping WCAG 2.2 criterion ${wcagNum} (not supported by OpenACR Editor)`);
      return; // Skip this criterion
    }
    
    let adherenceLevel = convertAssessmentToAdherence(item['ACR Assessment']);
    let notes = item['ACR Summary'] || 'No assessment available';
    
    // Check if criterion should be marked as Not Applicable
    if (isNotApplicable(wcagNum)) {
      adherenceLevel = 'not-applicable';
      notes = 'Not applicable.';
      console.log(`ℹ️  Marking WCAG ${wcagNum} as Not Applicable`);
    } else {
      // Use positive accessibility statement for fully supported criteria
      // TODO: Consider expanding this logic when OpenACR Editor supports WCAG 2.2
      if (adherenceLevel === 'supports') {
        const positiveStatement = getPositiveStatement(wcagNum);
        if (positiveStatement) {
          notes = positiveStatement;
        }
      }
    }
    
    const criterion = {
      num: wcagNum,
      adherenceLevel,
      notes,
      issueCount: item['Issue Count'],
      issueIds: item['Issue IDs']
    };
    
    // Determine WCAG level using the proper categorization
    const wcagLevel = getWCAGLevel(wcagNum);
    
    if (wcagLevel === 'A') {
      levelACriteria.push(criterion);
    } else if (wcagLevel === 'AA') {
      levelAACriteria.push(criterion);
    } else {
      levelAAACriteria.push(criterion);
    }
  });
  
  // Add any N/A criteria that weren't in the consolidated data
  const processedWcagNums = new Set();
  consolidatedData.forEach(item => {
    const wcagNum = convertWCAGFormat(item['WCAG SC']);
    if (!wcag22Criteria.includes(wcagNum)) {
      processedWcagNums.add(wcagNum);
    }
  });
  
  naList.forEach(wcagNum => {
    if (!processedWcagNums.has(wcagNum)) {
      console.log(`ℹ️  Adding missing N/A criterion: WCAG ${wcagNum}`);
      
      const criterion = {
        num: wcagNum,
        adherenceLevel: 'not-applicable',
        notes: 'Not applicable.',
        issueCount: 0,
        issueIds: ''
      };
      
      // Determine WCAG level and add to appropriate array
      const wcagLevel = getWCAGLevel(wcagNum);
      if (wcagLevel === 'A') {
        levelACriteria.push(criterion);
      } else if (wcagLevel === 'AA') {
        levelAACriteria.push(criterion);
      } else {
        levelAAACriteria.push(criterion);
      }
    }
  });
  
  // Add Level A criteria
  levelACriteria.forEach(criterion => {
    yaml += `      - num: ${criterion.num}
        components:
          - name: web
            adherence:
              level: ${criterion.adherenceLevel}
              notes: ${formatYAMLMultiline(criterion.notes, '              ')}
          - name: electronic-docs
            adherence:
              level: not-applicable
              notes: ""
          - name: software
            adherence:
              level: not-applicable
              notes: ""
          - name: authoring-tool
            adherence:
              level: ${criterion.adherenceLevel}
              notes: ${formatYAMLMultiline(criterion.notes, '              ')}
`;
  });
  
  // Add Level AA section
  yaml += `  success_criteria_level_aa:
    notes: >-
      Level AA Success Criteria assessments based on identified accessibility 
      issues and automated analysis. The Drupal community strives to exceed 
      Level A compliance where possible.
    criteria:`;
  
  if (levelAACriteria.length === 0) {
    yaml += ` []\n`;
  } else {
    yaml += `\n`;
    // Add Level AA criteria
    levelAACriteria.forEach(criterion => {
      yaml += `      - num: ${criterion.num}
        components:
          - name: web
            adherence:
              level: ${criterion.adherenceLevel}
              notes: ${formatYAMLMultiline(criterion.notes, '              ')}
          - name: electronic-docs
            adherence:
              level: not-applicable
              notes: ""
          - name: software
            adherence:
              level: not-applicable
              notes: ""
          - name: authoring-tool
            adherence:
              level: ${criterion.adherenceLevel}
              notes: ${formatYAMLMultiline(criterion.notes, '              ')}
`;
    });
  }
  
  // Add Level AAA section
  yaml += `  success_criteria_level_aaa:
    notes: Where possible the Drupal community strives to exceed AA compliance.
    criteria:`;
  
  if (levelAAACriteria.length === 0) {
    yaml += ` []\n`;
  } else {
    yaml += `\n`;
    // Add Level AAA criteria
    levelAAACriteria.forEach(criterion => {
      yaml += `      - num: ${criterion.num}
        components:
          - name: web
            adherence:
              level: ${criterion.adherenceLevel}
              notes: ${formatYAMLMultiline(criterion.notes, '              ')}
          - name: electronic-docs
            adherence:
              level: not-applicable
              notes: ""
          - name: software
            adherence:
              level: not-applicable
              notes: ""
          - name: authoring-tool
            adherence:
              level: ${criterion.adherenceLevel}
              notes: ${formatYAMLMultiline(criterion.notes, '              ')}
`;
    });
  }
  
  yaml += `    disabled: false
  functional_performance_criteria:
    notes: Not applicable.
    criteria:
      - num: "302.1"
        components:
          - name: none
            adherence:
              level: supports
              notes: "Testing has been done with JAWS, NVDA and VoiceOver."
      - num: "302.2"
        components:
          - name: none
            adherence:
              level: supports
              notes: Testing has been done with browser zoom and ZoomText.
      - num: "302.3"
        components:
          - name: none
            adherence:
              level: supports
              notes: The interface has been reviewed for use of color.
      - num: "302.4"
        components:
          - name: none
            adherence:
              level: not-applicable
              notes: ""
      - num: "302.5"
        components:
          - name: none
            adherence:
              level: not-applicable
              notes: ""
      - num: "302.6"
        components:
          - name: none
            adherence:
              level: not-applicable
              notes: ""
      - num: "302.7"
        components:
          - name: none
            adherence:
              level: supports
              notes: >-
                Drupal's interface does not restrict users with limited
                manipulation.
      - num: "302.8"
        components:
          - name: none
            adherence:
              level: supports
              notes: >-
                Drupal's interface does not restrict users with limited reach or
                strength.
      - num: "302.9"
        components:
          - name: none
            adherence:
              level: not-applicable
              notes: ""
    disabled: true
  hardware:
    notes: >-
      Drupal is a web application. Hardware accessibility criteria is not
      applicable.
    criteria:
      - num: 402.2.1
        components:
          - name: none
            adherence:
              level: ""
              notes: ""
    disabled: true
  software:
    notes: >-
      Drupal is a web application. Software accessibility criteria is not
      applicable.
    criteria:
      - num: 502.2.1
        components:
          - name: none
            adherence:
              level: ""
              notes: ""
    disabled: true
  support_documentation_and_services:
    notes: >-
      Drupal is a web application and all support documentation is delivered
      through the web. Additional documentation and services are not available.
    criteria:
      - num: "602.2"
        components:
          - name: none
            adherence:
              level: not-applicable
              notes: ""
      - num: "602.3"
        components:
          - name: none
            adherence:
              level: ""
              notes: ""
      - num: "602.4"
        components:
          - name: none
            adherence:
              level: not-applicable
              notes: ""
      - num: "603.2"
        components:
          - name: none
            adherence:
              level: not-applicable
              notes: ""
      - num: "603.3"
        components:
          - name: none
            adherence:
              level: not-applicable
              notes: ""
vendor:
  name: ""
  company_name: ""
  address: ""
  email: ""
  phone: ""
  website: ""
catalog: 2.4-edition-wcag-2.1-en
`;

  return yaml;
}

// Determine if a WCAG criteria is Level A, AA, or AAA
function getWCAGLevel(wcagNum) {
  // WCAG 2.1 Level A criteria
  const levelACriteria = [
    '1.1.1', '1.2.1', '1.2.2', '1.2.3', '1.3.1', '1.3.2', '1.3.3',
    '1.4.1', '1.4.2', '2.1.1', '2.1.2', '2.1.4', '2.2.1', '2.2.2',
    '2.3.1', '2.4.1', '2.4.2', '2.4.3', '2.4.4', '2.5.1', '2.5.2',
    '2.5.3', '2.5.4', '3.1.1', '3.2.1', '3.2.2', '3.3.1', '3.3.2',
    '4.1.1', '4.1.2'
  ];
  
  // WCAG 2.1 Level AA criteria (excluding WCAG 2.2 additions)
  // TEMPORARY: Removed 2.4.11 and 2.5.8 which are WCAG 2.2 criteria
  // TODO: Add back WCAG 2.2 criteria when OpenACR Editor supports them
  const levelAACriteria = [
    '1.2.4', '1.2.5', '1.3.4', '1.3.5', '1.4.3', '1.4.4', '1.4.5',
    '1.4.10', '1.4.11', '1.4.12', '1.4.13', '2.4.5', '2.4.6', '2.4.7',
    '3.1.2', '3.2.3', '3.2.4', '3.3.3', '3.3.4', '4.1.3'
  ];
  
  // WCAG 2.1 Level AAA criteria
  const levelAAACriteria = [
    '1.2.6', '1.2.7', '1.2.8', '1.2.9', '1.3.6', '1.4.6', '1.4.7',
    '1.4.8', '1.4.9', '2.1.3', '2.2.3', '2.2.4', '2.2.5', '2.2.6',
    '2.3.2', '2.3.3', '2.4.8', '2.4.9', '2.4.10', '2.5.5', '2.5.6',
    '3.1.3', '3.1.4', '3.1.5', '3.1.6', '3.2.5', '3.3.5',
    '3.3.6'
  ];
  
  if (levelACriteria.includes(wcagNum)) {
    return 'A';
  } else if (levelAACriteria.includes(wcagNum)) {
    return 'AA';
  } else if (levelAAACriteria.includes(wcagNum)) {
    return 'AAA';
  } else {
    // Default to AA for unknown criteria
    return 'AA';
  }
}

// Legacy function for backward compatibility
function isLevelA(wcagNum) {
  return getWCAGLevel(wcagNum) === 'A';
}

// Main conversion function
async function convertToOpenACR() {
  console.log('🔄 OpenACR YAML Converter');
  console.log('========================');
  
  let consolidatedFile;
  
  // Check if a specific file was provided as command line argument
  const inputFile = process.argv[2];
  if (inputFile) {
    if (fs.existsSync(inputFile)) {
      consolidatedFile = inputFile;
      console.log(`📁 Using specified file: ${inputFile}`);
    } else {
      console.log(`❌ Error: File not found: ${inputFile}`);
      process.exit(1);
    }
  } else {
    // Default behavior: find latest consolidated ACR CSV
    const resultsDir = 'results';
    if (!fs.existsSync(resultsDir)) {
      console.log('❌ Error: results directory not found');
      process.exit(1);
    }
    
    const consolidatedFiles = fs.readdirSync(resultsDir)
      .filter(f => f.startsWith('wcag-acr-consolidated_') && f.endsWith('.csv'))
      .sort()
      .reverse();
    
    if (consolidatedFiles.length === 0) {
      console.log('❌ Error: No consolidated ACR CSV files found');
      console.log('💡 Run consolidate-wcag-summaries.js first');
      process.exit(1);
    }
    
    consolidatedFile = path.join(resultsDir, consolidatedFiles[0]);
    console.log(`📁 Using consolidated ACR: ${consolidatedFiles[0]}`);
  }
  
  // Read and parse the consolidated CSV
  console.log('📊 Reading consolidated CSV...');
  try {
    const consolidatedData = await parseCSV(consolidatedFile);
    
    console.log(`✅ Loaded ${consolidatedData.length} WCAG Success Criteria assessments`);
    
    // Generate OpenACR YAML
    console.log('🔧 Converting to OpenACR YAML format...');
    const yamlContent = generateOpenACR(consolidatedData);
    
    // Write output file
    const timestamp = new Date().toISOString().slice(0, 16).replace(/:/g, '-').replace('T', '_');
    const resultsDir = 'results';
    if (!fs.existsSync(resultsDir)) {
      fs.mkdirSync(resultsDir, { recursive: true });
    }
    const outputFile = path.join(resultsDir, `drupal-openacr_${timestamp}.yaml`);
    
    fs.writeFileSync(outputFile, yamlContent, 'utf8');
    
    console.log('\n✅ Conversion Complete!');
    console.log('=======================');
    console.log(`📁 Output file: ${outputFile}`);
    console.log(`📏 Generated ${yamlContent.split('\n').length} lines of YAML`);
    
    console.log('\n💡 Next steps:');
    console.log('• Review and customize the OpenACR YAML file');
    console.log('• Update the metadata (author, product, etc.) in drupal-template.yaml');
    console.log('• Validate the YAML at https://acreditor.section508.gov/');
    console.log('• Upload to the ACR Editor for further refinement');
    
    console.log('\n⚠️  Important Note:');
    console.log('• WCAG 2.2 criteria are temporarily excluded (2.4.11, 2.5.8, etc.)');
    console.log('• These will be included when OpenACR Editor supports WCAG 2.2');
    console.log('• N/A criteria are automatically marked as not-applicable');
    
    console.log('\n📝 Template and customization:');
    console.log('• Modify drupal-template.yaml to customize the report header');
    console.log('• Update the naList in convert-to-openacr.js to change N/A criteria');
    console.log('• Review and adjust assessment notes');
    console.log('• Verify WCAG criteria mappings');
    
  } catch (error) {
    console.error('❌ Error parsing CSV:', error.message);
    process.exit(1);
  }
}

// Run the converter
convertToOpenACR().catch(console.error);

#!/usr/bin/env node

/**
 * Drupal Accessibility Conformance Report (ACR) Generator
 * 
 * This script orchestrates the complete workflow for generating
 * OpenACR-compliant accessibility conformance reports from Drupal.org issues.
 * 
 * Workflow Steps:
 * 1. Extract WCAG issues from Drupal.org
 * 2. Generate AI-powered summaries for each issue
 * 3. Consolidate issues by WCAG Success Criteria
 * 4. Convert to OpenACR YAML format
 */

import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { readdir } from 'fs/promises';
import path from 'path';

const RESULTS_DIR = 'results';

// ANSI color codes for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function showUsage() {
  log('\n🎯 Drupal ACR Generator', colors.bright + colors.blue);
  log('========================\n', colors.blue);
  
  log('Usage:', colors.bright);
  log('  npm run acr [options]', colors.cyan);
  log('  node run-acr-workflow.js [options]\n');
  
  log('Options:', colors.bright);
  log('  --help, -h     Show this help message');
  log('  --step <1-4>   Run only a specific step');
  log('  --skip <1-4>   Skip a specific step');
  log('  --from <1-4>   Start from a specific step');
  log('  --to <1-4>     Stop at a specific step');
  log('  --dry-run      Show what would be executed without running');
  log('  --verbose      Show detailed progress information\n');
  
  log('Steps:', colors.bright);
  log('  1. Extract WCAG issues from Drupal.org');
  log('  2. Generate AI summaries for issues');
  log('  3. Consolidate issues by WCAG Success Criteria');
  log('  4. Convert to OpenACR YAML format\n');
  
  log('Examples:', colors.bright);
  log('  node run-acr-workflow.js              # Run complete workflow');
  log('  node run-acr-workflow.js --step 2     # Run only AI summaries');
  log('  node run-acr-workflow.js --from 3     # Run steps 3-4');
  log('  node run-acr-workflow.js --skip 1     # Run steps 2-4');
  log('  node run-acr-workflow.js --dry-run    # Show execution plan\n');
  
  log('Prerequisites:', colors.bright);
  log('  • Node.js 18+ installed');
  log('  • GEMINI_API_KEY environment variable set (for step 2)');
  log('  • .env file with API key (alternative to environment variable)\n');
  
  log('Environment Setup:', colors.bright);
  log('  cp .env.example .env');
  log('  # Edit .env and add: GEMINI_API_KEY=your-api-key-here\n');
}

async function runCommand(command, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    log(`\n🔄 Running: ${command} ${args.join(' ')}`, colors.cyan);
    
    const child = spawn(command, args, {
      stdio: 'inherit',
      shell: true,
      ...options
    });
    
    child.on('close', (code) => {
      if (code === 0) {
        log(`✅ Completed: ${command}`, colors.green);
        resolve(code);
      } else {
        log(`❌ Failed: ${command} (exit code: ${code})`, colors.red);
        reject(new Error(`Command failed with exit code ${code}`));
      }
    });
    
    child.on('error', (error) => {
      log(`❌ Error: ${error.message}`, colors.red);
      reject(error);
    });
  });
}

async function findLatestFile(pattern) {
  try {
    const files = await readdir(RESULTS_DIR);
    const matchingFiles = files
      .filter(file => file.includes(pattern))
      .sort()
      .reverse();
    
    return matchingFiles.length > 0 ? path.join(RESULTS_DIR, matchingFiles[0]) : null;
  } catch (error) {
    return null;
  }
}

async function checkPrerequisites() {
  log('\n🔍 Checking Prerequisites...', colors.bright);
  
  // Check if results directory exists
  if (!existsSync(RESULTS_DIR)) {
    log(`✅ Creating ${RESULTS_DIR} directory`, colors.green);
    await import('fs/promises').then(fs => fs.mkdir(RESULTS_DIR, { recursive: true }));
  }
  
  // Check for API key (needed for step 2)
  const hasApiKey = process.env.GEMINI_API_KEY || existsSync('.env');
  if (!hasApiKey) {
    log('⚠️  GEMINI_API_KEY not found in environment or .env file', colors.yellow);
    log('   Step 2 (AI summaries) will fail without an API key', colors.yellow);
    log('   Get your key from: https://aistudio.google.com/app/apikey', colors.yellow);
  } else {
    log('✅ GEMINI_API_KEY found', colors.green);
  }
  
  return hasApiKey;
}

async function executeStep(stepNumber, dryRun = false, verbose = false) {
  const steps = [
    {
      name: 'Extract WCAG Issues',
      command: 'node',
      args: ['extract-wcag-issues.js'],
      description: 'Extracts WCAG-tagged issues from Drupal.org with comprehensive metadata'
    },
    {
      name: 'Generate AI Summaries',
      command: 'node',
      args: ['generate-issue-summaries.js'],
      description: 'Creates AI-powered ACR notes and developer guidance for each issue'
    },
    {
      name: 'Consolidate by WCAG SC',
      command: 'node',
      args: ['consolidate-wcag-summaries.js'],
      description: 'Groups issues by WCAG Success Criteria and generates consolidated assessments'
    },
    {
      name: 'Convert to OpenACR',
      command: 'node',
      args: ['convert-to-openacr.js'],
      description: 'Generates government-compliant OpenACR YAML format for accessibility reports'
    }
  ];
  
  if (stepNumber < 1 || stepNumber > steps.length) {
    throw new Error(`Invalid step number: ${stepNumber}. Must be 1-${steps.length}`);
  }
  
  const step = steps[stepNumber - 1];
  
  log(`\n📋 Step ${stepNumber}: ${step.name}`, colors.bright + colors.magenta);
  log(`   ${step.description}`, colors.magenta);
  
  if (dryRun) {
    log(`   Would run: ${step.command} ${step.args.join(' ')}`, colors.yellow);
    return;
  }
  
  if (verbose) {
    // Check for input files
    if (stepNumber > 1) {
      const expectedInputs = [
        'wcag-detailed-issues_',
        'wcag-issue-summaries_',
        'wcag-acr-consolidated_'
      ];
      
      const inputPattern = expectedInputs[stepNumber - 2];
      const latestInput = await findLatestFile(inputPattern);
      
      if (latestInput) {
        log(`   📁 Using input: ${path.basename(latestInput)}`, colors.cyan);
      } else {
        log(`   ⚠️  No input file found matching: ${inputPattern}*`, colors.yellow);
      }
    }
  }
  
  await runCommand(step.command, step.args);
  
  // Show output file info if verbose
  if (verbose && stepNumber < steps.length) {
    const outputPatterns = [
      'wcag-detailed-issues_',
      'wcag-issue-summaries_',
      'wcag-acr-consolidated_',
      'drupal-openacr_'
    ];
    
    const outputPattern = outputPatterns[stepNumber - 1];
    const latestOutput = await findLatestFile(outputPattern);
    
    if (latestOutput) {
      log(`   📄 Generated: ${path.basename(latestOutput)}`, colors.green);
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  
  // Parse command line arguments
  let showHelp = false;
  let dryRun = false;
  let verbose = false;
  let specificStep = null;
  let skipStep = null;
  let fromStep = 1;
  let toStep = 4;
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    switch (arg) {
      case '--help':
      case '-h':
        showHelp = true;
        break;
      case '--dry-run':
        dryRun = true;
        break;
      case '--verbose':
        verbose = true;
        break;
      case '--step':
        specificStep = parseInt(args[++i]);
        break;
      case '--skip':
        skipStep = parseInt(args[++i]);
        break;
      case '--from':
        fromStep = parseInt(args[++i]);
        break;
      case '--to':
        toStep = parseInt(args[++i]);
        break;
      default:
        if (arg.startsWith('--')) {
          log(`❌ Unknown option: ${arg}`, colors.red);
          showUsage();
          process.exit(1);
        }
    }
  }
  
  if (showHelp) {
    showUsage();
    return;
  }
  
  // Validate step numbers
  if (specificStep && (specificStep < 1 || specificStep > 4)) {
    log('❌ Step number must be between 1 and 4', colors.red);
    process.exit(1);
  }
  
  if (skipStep && (skipStep < 1 || skipStep > 4)) {
    log('❌ Skip step number must be between 1 and 4', colors.red);
    process.exit(1);
  }
  
  if (fromStep < 1 || fromStep > 4 || toStep < 1 || toStep > 4 || fromStep > toStep) {
    log('❌ Invalid step range', colors.red);
    process.exit(1);
  }
  
  try {
    log('🚀 Drupal ACR Generator', colors.bright + colors.blue);
    log('======================', colors.blue);
    
    const hasApiKey = await checkPrerequisites();
    
    if (specificStep) {
      // Run only specific step
      if (specificStep === 2 && !hasApiKey && !dryRun) {
        log('\n❌ Cannot run step 2 without GEMINI_API_KEY', colors.red);
        process.exit(1);
      }
      
      await executeStep(specificStep, dryRun, verbose);
    } else {
      // Run range of steps
      const stepsToRun = [];
      for (let step = fromStep; step <= toStep; step++) {
        if (skipStep === null || step !== skipStep) {
          stepsToRun.push(step);
        }
      }
      
      if (stepsToRun.includes(2) && !hasApiKey && !dryRun) {
        log('\n❌ Cannot run step 2 without GEMINI_API_KEY', colors.red);
        log('   Either set up your API key or use --skip 2', colors.red);
        process.exit(1);
      }
      
      if (dryRun) {
        log('\n📋 Execution Plan:', colors.bright);
      }
      
      for (const step of stepsToRun) {
        await executeStep(step, dryRun, verbose);
      }
    }
    
    if (!dryRun) {
      log('\n🎉 Workflow completed successfully!', colors.bright + colors.green);
      log('\n💡 Next steps:', colors.bright);
      log('• Review generated files in the results/ directory');
      log('• Validate OpenACR YAML: npx openacr validate -f results/drupal-openacr_*.yaml');
      log('• Upload to OpenACR Editor: https://acreditor.section508.gov/');
      log('• Customize templates: edit drupal-template.yaml');
    } else {
      log('\n📋 Dry run completed. Use without --dry-run to execute.', colors.yellow);
    }
    
  } catch (error) {
    log(`\n❌ Workflow failed: ${error.message}`, colors.red);
    process.exit(1);
  }
}

// Handle uncaught errors gracefully
process.on('uncaughtException', (error) => {
  log(`\n💥 Uncaught error: ${error.message}`, colors.red);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  log(`\n💥 Unhandled rejection: ${reason}`, colors.red);
  process.exit(1);
});

// Run the main function
main().catch((error) => {
  log(`\n❌ Fatal error: ${error.message}`, colors.red);
  process.exit(1);
});

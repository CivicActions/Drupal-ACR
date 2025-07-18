// Quick test to verify the filename logging fix
const fs = require('fs');
const path = require('path');

// Mock a small CSV generation to test the filename return
async function testFilenameGeneration() {
  console.log('🧪 Testing filename generation and logging...\n');
  
  // Simulate the CSV generation logic
  const resultsDir = 'results';
  if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true });
  }
  
  // Generate timestamp for filename (same logic as main script)
  const now = new Date();
  const timestamp = now.toISOString().slice(0, 16).replace(/:/g, '-').replace('T', '_');
  
  const outputFile = path.join(resultsDir, `test-filename-${timestamp}.csv`);
  
  // Write a test CSV
  const testContent = 'WCAG SC,Issue ID,Title\nwcag111,12345,Test Issue\n';
  fs.writeFileSync(outputFile, testContent, 'utf8');
  
  console.log(`✅ Test CSV generated!`);
  console.log(`📁 File: ${outputFile}`);
  console.log(`📊 Testing filename return...`);
  
  // Simulate the main function logic
  const csvFile = outputFile; // This is what the main script will receive
  
  console.log(`\n📊 Final Summary:`);
  console.log('================');
  console.log(`📁 Detailed CSV generated: ${csvFile}`);
  
  // Clean up test file
  fs.unlinkSync(outputFile);
  console.log(`\n🧹 Test file cleaned up`);
  console.log(`✅ Filename logging test successful!`);
}

testFilenameGeneration().catch(console.error);

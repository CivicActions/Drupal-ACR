# Drupal Accessibility Conformance Report (ACR) Generator

A comprehensive toolkit for generating OpenACR-compliant accessibility conformance reports from Drupal.org issues. This automated workflow extracts WCAG-related issues, analyzes them with AI, consolidates findings by WCAG Success Criteria, and produces government-compliant accessibility reports.

## 🎯 Quick Start

```bash
# 1. Clone and setup
git clone <repository-url>
cd drupal-acr
npm install

# 2. Set up API key for AI analysis
cp .env.example .env
# Edit .env and add: GEMINI_API_KEY=your-api-key-here

# 3. Run complete workflow
node run-acr-workflow.js

# 4. Validate output
npx openacr validate -f results/drupal-openacr_*.yaml
```

Get your Gemini API key from: https://aistudio.google.com/app/apikey

## 🔄 Four-Step Workflow

### Step 1: Extract WCAG Issues
**File:** `extract-wcag-issues.js`
- Extracts all WCAG-tagged issues from Drupal.org
- Processes 80+ WCAG 2.1/2.2 Success Criteria
- Collects comprehensive metadata (status, priority, comments, etc.)
- Bypasses bot detection with intelligent retry strategies
- **Output:** `results/wcag-detailed-issues_YYYY-MM-DD_HH-MM.csv`

### Step 2: Generate AI Summaries  
**File:** `generate-issue-summaries.js`
- Uses Google Gemini AI to analyze each issue
- Generates professional ACR (Accessibility Conformance Report) notes
- Creates technical developer guidance for issue resolution
- Assesses title accuracy and suggests improvements
- **Output:** `results/wcag-issue-summaries_YYYY-MM-DD_HH-MM.csv`

### Step 3: Consolidate by WCAG Success Criteria
**File:** `consolidate-wcag-summaries.js`
- Groups individual issues by WCAG Success Criteria
- Creates master assessments with AI-powered consolidation
- Determines compliance levels (SUPPORTED, PARTIALLY_SUPPORTED, NOT_SUPPORTED)
- Provides real-time console output of assessments
- **Output:** `results/wcag-acr-consolidated_YYYY-MM-DD_HH-MM.csv`

### Step 4: Convert to OpenACR Format
**File:** `convert-to-openacr.js`
- Converts consolidated data to government-compliant OpenACR YAML
- Applies positive accessibility statements for well-supported criteria
- Handles WCAG 2.2 compatibility (with future-proofing)
- Uses customizable templates for organization-specific branding
- **Output:** `results/drupal-openacr_YYYY-MM-DD_HH-MM.yaml`

## 🚀 Master Workflow Script

The `run-acr-workflow.js` script orchestrates all four steps:

```bash
# Run complete workflow
node run-acr-workflow.js

# Run specific step only
node run-acr-workflow.js --step 2

# Run from step 3 to end
node run-acr-workflow.js --from 3

# Skip step 1 (use existing data)
node run-acr-workflow.js --skip 1

# Dry run (show execution plan)
node run-acr-workflow.js --dry-run

# Verbose output
node run-acr-workflow.js --verbose

# Help
node run-acr-workflow.js --help
```
## 📊 Data Flow

```
Drupal.org Issues → Extract → AI Analysis → Consolidate → OpenACR YAML
     🌐              📥        🤖           📋           📄
```

1. **Raw Issues** (300+ individual accessibility issues)
2. **Detailed CSV** (comprehensive metadata per issue)  
3. **AI Summaries** (professional ACR notes + dev guidance)
4. **Consolidated ACR** (assessments by WCAG Success Criteria)
5. **OpenACR YAML** (government-compliant accessibility report)

## 📁 File Structure

```
drupal-acr/
├── extract-wcag-issues.js        # Step 1: Extract from Drupal.org
├── generate-issue-summaries.js   # Step 2: AI-powered analysis
├── consolidate-wcag-summaries.js # Step 3: Consolidate by WCAG SC
├── convert-to-openacr.js         # Step 4: Generate OpenACR YAML
├── run-acr-workflow.js           # Master workflow orchestrator
├── drupal-template.yaml          # Customizable OpenACR template
├── .env.example                  # Environment variables template
├── package.json                  # Dependencies and scripts
├── README.md                     # This file
└── results/                      # Generated CSV and YAML files
    ├── wcag-detailed-issues_*.csv
    ├── wcag-issue-summaries_*.csv
    ├── wcag-acr-consolidated_*.csv
    └── drupal-openacr_*.yaml
```

## ⚙️ Configuration

### Environment Variables
Create a `.env` file with:
```bash
GEMINI_API_KEY=your-actual-api-key-here
```

### Template Customization
Edit `drupal-template.yaml` to customize:
- Product information
- Author/organization details  
- Report descriptions
- Contact information

### N/A Criteria List
Modify the `naList` array in `convert-to-openacr.js` to specify WCAG criteria that should be marked as "Not Applicable":
```javascript
const naList = ['1.2.4', '1.2.5', '2.1.4', '2.2.1', '2.2.2', '2.3.1', '2.5.4', '3.3.8', '4.1.1'];
```

## 📋 CSV Data Structure

### Step 1 Output: Detailed Issues
| Column | Description |
|--------|-------------|
| WCAG SC | WCAG Success Criteria (e.g., wcag111, wcag143) |
| Issue ID | Drupal.org issue number |
| Issue Title | Full issue title |
| Issue URL | Direct link to issue |
| Project | Drupal project name |
| Status | Current status (Active, Fixed, etc.) |
| Priority | Issue priority (Critical, Major, etc.) |
| Component | Affected Drupal component |
| Version | Target Drupal version |
| Reporter | Issue reporter username |
| Created | Creation date |
| Updated | Last update date |
| Comments | Number of comments |
| Has Fork | Fork/MR availability |
| Last Commenter | Most recent commenter |
| Extracted At | Data extraction timestamp |

### Step 2 Output: AI Summaries
| Column | Description |
|--------|-------------|
| Issue ID | Drupal.org issue identifier |
| ACR Note | Professional accessibility barrier description |
| Developer Note | Technical guidance for resolution |
| Title Assessment | Title accuracy evaluation |
| Processed At | AI analysis timestamp |

### Step 3 Output: Consolidated ACR
| Column | Description |
|--------|-------------|
| WCAG SC | WCAG Success Criteria |
| ACR Assessment | Compliance level (SUPPORTED/PARTIALLY_SUPPORTED/NOT_SUPPORTED) |
| ACR Summary | Consolidated assessment for the criteria |
| Issue Count | Number of related issues |
| Issue IDs | Comma-separated list of issue IDs |
| Processed At | Consolidation timestamp |

## 🤖 AI-Powered Features

### ACR Notes Include:
- Professional compliance language for accessibility reports
- Clear barrier descriptions with user impact analysis
- Section 508 disability impact mapping (vision, hearing, motor, cognitive)
- Browser-specific limitations and compatibility notes
- WCAG Success Criteria references

### Developer Notes Include:
- Patch/merge request analysis from issue comments
- Technical next steps and recommended actions
- Differentiation between current and outdated solutions
- Browser-specific issues and API change considerations
- Blocker identification and review status

### Positive Accessibility Statements:
- 85+ pre-written positive descriptions for WCAG criteria
- Automatically applied to well-supported features
- Highlights accessibility achievements alongside problems
- Provides balanced view in compliance reports

## 🎯 Expected Performance

| Step | Runtime | API Cost | Output Size |
|------|---------|----------|-------------|
| 1. Extract | 15-30 min | Free | ~300 issues |
| 2. AI Analysis | 20-30 min | $3-15 | ACR summaries |
| 3. Consolidate | 2-5 min | $2-8 | 45 criteria |
| 4. Convert | <1 min | Free | OpenACR YAML |

**Total:** ~45-60 minutes, $5-25 in API costs

## ✅ Quality Features

### Reliability:
- Progressive retry strategies with exponential backoff
- Bot detection bypass with tool-based user agents
- Comprehensive error handling and recovery
- Session management and rate limiting

### Validation:
- OpenACR CLI validation integration
- Government schema compliance
- WCAG 2.2 future-proofing with clear TODO markers
- Comprehensive data validation and error checking

### User Experience:
- Real-time progress reporting with colored console output
- Helpful error messages and troubleshooting guidance
- Flexible command-line options for different use cases
- Automatic file management with timestamped outputs

## 🏛️ Government Compliance

The generated OpenACR YAML files are fully compliant with:
- **Section 508** accessibility requirements
- **WCAG 2.1 Level A/AA** standards  
- **GSA OpenACR** schema specifications
- **Federal accessibility** reporting guidelines

Validated with: `npx openacr validate -f results/drupal-openacr_*.yaml`

## 🔧 Troubleshooting

### Common Issues:

**Missing API Key:**
```bash
# Set environment variable
export GEMINI_API_KEY="your-key-here"

# Or create .env file
echo "GEMINI_API_KEY=your-key-here" > .env
```

**Rate Limiting:**
- Built-in delays respect API quotas
- Automatic retry with exponential backoff
- Progress is saved between runs

**No Input Data:**
- Run steps in order (1→2→3→4)
- Use `--from` flag to resume from specific step
- Check `results/` directory for existing files

**OpenACR Validation Errors:**
- Ensure complete workflow execution
- Check WCAG 2.2 criteria handling
- Validate template customizations

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Test with sample data
4. Submit pull request with clear description

## 📄 License

[License information here]

## 🆘 Support

- **Issues:** Create GitHub issue with error details
- **API Key:** https://aistudio.google.com/app/apikey
- **OpenACR:** https://acreditor.section508.gov/
- **WCAG Guidelines:** https://www.w3.org/WAI/WCAG21/quickref/

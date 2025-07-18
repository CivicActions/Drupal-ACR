# Drupal-ACR - WCAG Issues Extraction Tool

A Node.js tool for extracting and analyzing WCAG (Web Content Accessibility Guidelines) related issues from Drupal.org. This tool provides comprehensive data collection for accessibility issue tracking and development management.

## Phase 1 Complete ✅

Phase 1 has been successfully completed with a fully functional automated extraction system that bypasses bot detection and provides comprehensive metadata for all WCAG-tagged issues.

## Files Overview

### Core Scripts

- **`extract-wcag-issues.js`** - Main extraction script with enhanced metadata collection
  - Extracts issues for all 80 WCAG 2.2 Success Criteria (Level A, AA, AAA)
  - Uses tool-based User-Agents (curl/wget) to bypass bot detection
  - Collects comprehensive metadata: Status, Priority, Component, Version, Reporter, Dates, Comments, Forks
  - Generates timestamped CSV files in `results/` directory
  - Implements progressive retry strategy for reliability

- **`scan-wcag.js`** - Alternative scanning approach with different extraction patterns
- **`generate-wcag-urls.js`** - Template generator for manual URL creation

### Results Directory

The `results/` directory contains all generated CSV files with timestamped filenames:

- **Latest Complete Dataset**: `wcag-detailed-issues_2025-07-18_18-39.csv`
  - Contains all discovered WCAG issues with full metadata
  - 16 columns of comprehensive data per issue
  - Sorted by WCAG SC and project

## CSV Data Structure

Each generated CSV contains the following columns:

| Column | Description |
|--------|-------------|
| WCAG SC | WCAG Success Criteria code (e.g., wcag111, wcag143) |
| Issue ID | Drupal.org issue number |
| Issue Title | Full issue title |
| Issue URL | Direct link to the issue |
| Project | Drupal project name (drupal, contrib modules, etc.) |
| Status | Current issue status (Active, Postponed, Fixed, etc.) |
| Priority | Issue priority (Major, Normal, Minor, Critical) |
| Component | Drupal component/system affected |
| Version | Target Drupal version |
| Reporter | Username of issue reporter |
| Created | Issue creation date (YYYY-MM-DD) |
| Updated | Last update date (YYYY-MM-DD) |
| Comments | Number of comments on the issue |
| Has Fork | Whether issue has a fork/merge request |
| Last Commenter | Username of most recent commenter |
| Extracted At | Timestamp of data extraction |

## Usage

### Run Full Extraction

```bash
node extract-wcag-issues.js
```

This will:
1. Process all 80 WCAG 2.2 Success Criteria
2. Extract individual issue details with enhanced metadata
3. Generate a timestamped CSV file in `results/`
4. Provide progress updates and statistics

### Expected Runtime

- **Total WCAG Criteria**: 80
- **Estimated Time**: 15-30 minutes (depending on issues found and network conditions)
- **Rate Limiting**: Built-in delays to avoid bot detection
- **Bot Detection**: Automatically handled with progressive retry strategy

## Technical Features

### Bot Detection Bypass
- Tool-based User-Agents (curl, wget) instead of browser fingerprints
- Simplified headers that don't trigger security measures
- Progressive retry strategy with exponential backoff
- Session warming and cookie management

### Enhanced Metadata Extraction
- Individual issue page scraping for detailed metadata
- Accurate comment counting (fixed from previous issues)
- Fork detection for development tracking
- Last commenter identification for follow-up management

### Error Handling & Reliability
- Multiple fallback strategies (HTML parsing → RSS feeds → progressive retry)
- Comprehensive error logging and recovery
- Automatic retry with extended delays for blocked requests
- Session management and fingerprint rotation

## Data Quality

### Recent Improvements
- ✅ Fixed comment counting accuracy (was showing inflated numbers)
- ✅ Improved fork detection (was showing false positives)
- ✅ Added Status, Priority, Component, Version fields
- ✅ Enhanced last commenter extraction
- ✅ Accurate CSV escaping and formatting

### Validation
- Comment counts verified against actual issue pages
- Fork detection tested against known forked/non-forked issues
- All metadata fields validated with real Drupal.org data

## Results Summary

From the latest complete run (`wcag-detailed-issues_2025-07-18_18-39.csv`):

- **Total Issues Extracted**: ~300+ WCAG-tagged issues
- **WCAG Criteria Covered**: ~44 of 80 criteria have associated issues
- **Projects Included**: Drupal core, contrib modules, themes
- **Data Completeness**: Full metadata for all discovered issues

## Next Steps

Phase 1 is complete with a robust, automated extraction system. Potential Phase 2 enhancements could include:

- Real-time monitoring and alerts for new WCAG issues
- Integration with project management tools
- Automated trend analysis and reporting
- Advanced filtering and querying capabilities

## Technical Notes

- **Node.js Version**: Tested with Node.js 18+ (uses built-in fetch)
- **Dependencies**: Only built-in Node.js modules (fs, path)
- **Rate Limiting**: 5-15 second delays between requests
- **File Organization**: Timestamped outputs in `results/` directory
- **Logging**: Comprehensive progress and error logging

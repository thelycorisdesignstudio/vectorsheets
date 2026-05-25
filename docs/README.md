# Vectorsheets Documentation

This directory contains operator and engineering documentation for the Vectorsheets product.

## Read This First

- [Feature Guide](FEATURES.md): product capabilities and user workflows.
- [Local Development](LOCAL_DEVELOPMENT.md): setup, running, hosting, and verification.
- [AI Configuration and Troubleshooting](AI_CONFIGURATION.md): Azure OpenAI, OpenAI, fallback behavior, and common errors.

## Product Summary

Vectorsheets is a spreadsheet workbench with a server-side AI workbook engine. The user can generate a workbook from a business prompt, load operator kits, edit the grid directly, inspect formulas, validate data, profile schema, build summaries, chart results, save workbooks, and export reports.

The app intentionally keeps the interface close to spreadsheet patterns:

- Left workspace navigation.
- Top workbook actions.
- Prompt command line.
- Formula bar.
- Grid.
- Right inspector with tools, schema, activity, and analysis.

## Verification Standard

A change should be treated as complete only after these pass:

```powershell
npm run build
npm run smoke
```

For visual changes, also capture and inspect desktop and mobile screenshots:

```powershell
npx playwright screenshot --viewport-size=1440,1000 http://127.0.0.1:8080 vectorsheets-modern-desktop.png
npx playwright screenshot --viewport-size=390,1000 http://127.0.0.1:8080 vectorsheets-modern-mobile.png
```

Generated screenshots are ignored by Git.

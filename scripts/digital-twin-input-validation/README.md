# DWES Validation Pipeline

This directory contains the isolated Node.js validation script used to verify Chennai engineering input packages.

## Scripts

- **`validate-package.mjs`**: The main execution script. Runs offline.
- **`validation-rules.json`**: Declarative summary of the validation logic.

## Usage

```bash
node validate-package.mjs path/to/package
```

With JSON report output:
```bash
node validate-package.mjs path/to/package --json-report validation-report.json
```

## Security

The validator never executes binary CAD models or executes unknown code. It strictly validates file structure, CSV layouts, relational integrity (orphans, duplicates), and safe file references.

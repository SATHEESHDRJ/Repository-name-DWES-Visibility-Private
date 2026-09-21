# DWES Digital Twin Engineering Input

This directory contains the required templates, dictionaries, and workflows for the Chennai design team to prepare the structured engineering 3D data required by the DWES Cable Digital Twin.

## Core Documents

- **CHENNAI_ENGINEERING_INPUT_GUIDE.md**: The primary manual explaining *why* structured data is needed and how to measure it.
- **DIGITAL_TWIN_INPUT_CHECKLIST.md**: The mandatory checklist before any submission.
- **DIGITAL_TWIN_FIELD_DICTIONARY.md**: Definitions for every column in the CSV templates.
- **DIGITAL_TWIN_REVISION_WORKFLOW.md**: Rules for handling updates, changes, and superseded revisions.
- **DIGITAL_TWIN_FILE_NAMING_STANDARD.md**: Mandatory file naming conventions.

## Templates

See `templates/` for the master CSV and JSON files.

## Validation

All packages must be validated offline using the `validate-package.mjs` script located in `scripts/digital-twin-input-validation/` before transmission.

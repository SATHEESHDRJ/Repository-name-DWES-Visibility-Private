# Private demo accounts

DWES no longer stores usable demo passwords in tracked source files. Local demo
seeding reads a private JSON file only when the user table is empty and startup
seeding is allowed (`DEMO_MODE=true`, or a non-production `NODE_ENV`).

## Local setup

1. Copy `backend/seeds/demo-accounts.example.json` to
   `backend/seeds/demo-accounts.local.json`.
2. Replace every angle-bracket placeholder and add the local roles required for
   your test workflow. Supported roles are `system_admin`, `ops_director`,
   `prod_supervisor`, `qaqc_engineer`, and `wiring_technician`.
3. Restrict the file to the current user. On Windows, run:

   ```powershell
   icacls backend\seeds\demo-accounts.local.json /inheritance:r /grant:r "$env:USERNAME:(R,W)"
   ```

   On Linux or macOS, run:

   ```sh
   chmod 600 backend/seeds/demo-accounts.local.json
   ```

4. Start DWES normally. To keep the private file outside the repository, set
   `DWES_DEMO_ACCOUNTS_FILE` to its absolute path before starting the backend.

The local file, the retired `accounts.seed.json` path, and E2E runtime account
files are ignored by Git and Docker build context. Never place production
credentials in this file. Production must keep `DEMO_MODE=false`, provision
accounts through the administrator workflow, and must not mount a demo account
file.

After changing local credentials, rotate or recreate any previously seeded
database users. Changing the JSON file does not update an existing database row.
Before committing, use `git status --ignored` or `git check-ignore` to confirm
the private file remains ignored.

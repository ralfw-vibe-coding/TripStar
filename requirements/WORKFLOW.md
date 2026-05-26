# Requirements Workflow

Requirements live in a lightweight kanban board:

- `requirements/issues/01 Backlog`
- `requirements/issues/02 Ready`
- `requirements/issues/03 Started`
- `requirements/issues/04 Done`

When instructed, move a ready requirement from `02 Ready` to `03 Started` and prefix the file name with the current date in `yyyy-mm-dd` format. After implementation and verification, move it to `04 Done`.

The implementation should preserve these product constraints:

- All application state access is encapsulated behind Domain State Providers.
- Providers have at least local/test and remote/production variants.
- Local development must not require Postgres, R2, Netlify deployment, or external AI services.
- Aim for 80% automated test coverage in non-frontend modules.
- UI interactions should be fluid, using API calls and local optimistic state where appropriate instead of full page reloads.

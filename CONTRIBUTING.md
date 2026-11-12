# Contributing

Use Node.js 26, npm and Git on Windows. Run npm ci, npm run build, npm test and npm start.
All editable UI source is in src/. Generated dist/ and desktop/vendor/ are ignored.
Run npm run check:build for deterministic asset checks; npm run package:win and
npm run test:e2e exercise real Electron using protocol/provider doubles and isolated profiles.
Do not run native smoke scripts concurrently: they temporarily replace a test package bootstrap.

Keep validated IPC, context isolation, approval boundaries and per-conversation routing.
Never copy credentials between providers, auto-run catalog entries or make paid calls in tests.
Add meaningful tests for changed behavior. Report the problem, resulting behavior, validation and limits.
Keep user data, secret files and diagnostic dumps out of contributions.
The optional Claude runtime is installed separately with npm run setup:claude under vendor terms.
Preserve the legacy Boau Code profile location until an explicit tested migration exists.
See FEATURE-PARITY.md, SECURITY.md and SOURCE-PROVENANCE.md.

Contributions to project-owned code are licensed under the project MIT license.

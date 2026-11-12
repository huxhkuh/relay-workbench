# Validation — 0.6.0 source renderer (2026-11-12)

## Completed locally on Windows

- 39 unit/integration tests: routing, persistence, approvals, interruption, restoration,
  editor conflicts, safe path access, state/history races, Markdown safety and reasoning redaction.
- Two clean builds produced identical hashes for all 8 generated renderer/backend/icon files.
- Full native Electron protocol fixture: streamed/final message deduplication, model selection,
  all six approval/input methods, partial permissions, typed MCP forms, active-request URL checks,
  interruption/failure/draft retention, paged history, rename/archive, quotas and sandbox settings.
- Native agent fixture: Claude approval, handoff draft, Antigravity approval, rendered result
  and persisted conversation ownership. Provider inference was doubled, not billed.
- Native workbench: actual UTF-8 save, external edit conflict, file context, project search,
  actual local command, actual Git staging/commit, settings, ACP catalog, isolated background
  worktree/approval and reopening its conversation. Background inference was doubled.
- Native maintenance: actual snapshot/restore and diagnostics, project pin/search, keyboard
  dialogs, compact dark layout and no unexpected workspace error when disconnected.
- Native login fixture: button-to-official-URL dispatch, reopening, masked code submission,
  input clearing and status redaction. No credentials were submitted to a provider.
- Native editor tabs: independent documents, unsaved tab state, correct save target,
  parent-folder navigation and preservation after canceling a native unsaved-close prompt.
- Official external Codex was discovered on PATH and reached protocol ready without a
  bundled runtime or inference request. Optional separately installed Claude SDK imported.
- Default npm audit and optional SDK lockfile audit reported no known vulnerabilities
  at check time. Dependency scans are not an independent security audit.

## Clean export and installed upgrade

A source-only export with no dist, node_modules or vendor runtime was installed with
npm ci, built, tested (39 passing), checked for deterministic outputs, packaged from
official Electron and passed all six native smoke suites. It did not use the legacy archive.
The final compact-layout adjustment was rebuilt/retested and visually checked separately.

The per-user 0.6.0 installation has 115 verified file hashes and the production entry point.
Its existing workspace.json matches the pre-upgrade backup. The installed bridge also
reached protocol ready with official external Codex, without an inference request.
The application was opened with the new source UI and branding.

## Scope and limits

The source export excludes dist and vendor runtimes; builds recreate all application assets.
Provider entitlement and full live inference were not reverified across all accounts.
Real Windows sandbox elevation, signed installers, other operating systems and large-project
performance are not claimed as verified. Live CI results are available in the repository Actions tab; the results above describe local runs.
A previous-version live Claude browser launch was checked; this version's UI uses deterministic
provider/browser doubles. Publication status is recorded by GitHub repository/release history.

## Public distribution and website

The branded electron-builder 26.18.0 / NSIS Windows installer and portable ZIP were built locally.
The actual installed ASAR app passed isolated-profile launch, version, file-editor save and settings checks.
Windows executable resource metadata identifies Relay Workbench 0.6.0; Authenticode status is NotSigned.
The static website passed Hebrew/English, RTL/LTR, keyboard demo, FAQ, mobile-menu, overflow,
JavaScript-error and exact artifact-link/SHA-256 metadata checks in isolated Edge.
The public release includes actual installer and ZIP checksums; commercial provider runtimes are excluded.
A minimatch 11.0.1 override removed six transitive builder development advisories; native packaging passed.

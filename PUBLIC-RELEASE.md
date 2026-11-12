# Publishing this developer preview

## Completed technical preparation

- Full maintained UI source; old compiled renderer, fonts and patch scripts removed.
- Clean source build, deterministic generated assets, Windows packaging from official Electron.
- Pinned lockfiles, explicit optional Claude runtime, MIT project license and dependency notices.
- Native protocol/workbench/maintenance fixtures, security/privacy docs, contribution templates and CI.
- Source export excludes dist, vendor runtimes, installations, profiles, credentials and logs.

## Publish steps for the repository owner

1. Review the prepared source archive and validation report.
2. Select the GitHub owner/repository and authorize the public upload.
3. Create the repository, push the source and run the prepared Windows checks.
4. Enable GitHub private vulnerability reporting and set a maintainer contact.
5. Publish as an unsigned developer preview with the documented limitations.

Build/export scripts do not create repositories or publish releases. The manual GitHub Pages
workflow publishes the static download site when the owner runs it.
The old renderer/asset-source blocker has been removed. A public source preview does
not claim production readiness, provider endorsement or equivalence to every feature
of proprietary Codex/Claude desktop applications.

## Before a stable binary release

Test a clean Windows machine and entitled accounts for each supported provider,
review the resulting CI run, add signing/update infrastructure if offered, and validate
accessibility/performance on representative projects. Other OSes remain unverified.

Release tooling: npm run installer:win builds the EXE/ZIP, npm run release:metadata
updates website download metadata/checksums, and npm run website:check validates the static site.
Publish verified artifacts through GitHub Releases; never upload the entire release directory,
builder effective configuration, test profiles or credential files.

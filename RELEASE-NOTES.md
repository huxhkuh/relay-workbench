# Relay Workbench 0.6.0 — first public developer preview

An independent Windows coding-agent workbench with a complete maintained source tree.

- Per-conversation agent selection, streaming Markdown, history and reviewed handoff drafts.
- Command/file approvals, questions, permission selection and typed MCP interactions.
- CodeMirror editor, conflict detection, project search, command output, Git and background worktrees.
- Project instructions/skills/MCP, recovery snapshots, diagnostics and light/dark Hebrew UI.
- Branded Windows x64 NSIS installer and portable ZIP; Hebrew/English product and download website.

## Download

Run Relay-Workbench-Setup-0.6.0-x64.exe for a per-user installation, or extract
Relay-Workbench-0.6.0-x64.zip and run Relay-Workbench.exe.
Check SHA256SUMS.txt against downloaded files. Both packages use official Electron and retain
third-party license notices. No provider CLI or proprietary Claude SDK is bundled.

## Requirements and limits

Windows 10/11 x64; an official agent tool and entitled account installed/configured separately.
Claude additionally needs the optional separately installed SDK; see README.md.
The app UI is Hebrew. This is an unsigned developer preview with no automatic update service.
It is not affiliated with OpenAI, Anthropic, Google or GitHub.

Local verification includes 39 unit/integration tests, six native Electron smoke suites,
a real installed NSIS/ASAR application check and bilingual desktop/mobile website QA.
Provider fixtures do not establish live model entitlement for every account. See VALIDATION.md
and the repository Actions tab for detailed scope and current CI results.

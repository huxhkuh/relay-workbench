# Renderer replacement: feature map

Version 0.6.0 replaces the compiled legacy renderer with maintained modules.
Behavior is implemented against the existing validated Electron IPC contracts.
The old React bundle, CSS, embedded fonts and original executable are not build inputs.

| Existing workflow | Maintained source | Verification |
|---|---|---|
| Projects, folder picker, removal and new chat | app.js, workspace-state.js | Native UI and state tests |
| Per-conversation agent choice and reviewed handoff | agents.js | Native agent/handoff fixture |
| Streamed messages, final deduplication, Markdown, code and copying | app.js, markdown.js, workspace-state.js | Native protocol and security tests |
| Command and file-change approval | approval-ui.js | Native protocol fixture |
| Permission selection and turn/session scope | approval-ui.js | Native protocol fixture; backend subset validation |
| Both user-question protocol variants | approval-ui.js | Native protocol fixture |
| MCP typed forms and URL elicitation | approval-ui.js, main.cjs | Native protocol fixture and active-request URL checks |
| Stop, failed model turn, failed submission and retry | workspace-state.js | Native protocol and state tests |
| History paging, search, rename, pin and archive discovery | workspace-state.js, productivity.js | Native history and maintenance fixtures |
| ChatGPT/device login, cancellation, account, quotas and config | workspace-state.js, app.js | Protocol fixtures; real-account completion remains external |
| Official external-agent login, reopen and manual code | agents.js, login-manager.cjs | Login fixture and prior live browser-launch check |
| Models, reasoning effort, read-only/write settings | app.js, workspace-state.js | Native settings and backend policy tests |
| Windows sandbox readiness/setup | app.js, workspace-state.js | Native protocol fixture; real privilege elevation not exercised |
| Activity, public plan and diffs | app.js, workspace-state.js | Native protocol fixture; raw reasoning is excluded |
| Editor tabs, save/conflict handling, file context and search | workbench-ui.js | Native workbench and editor-tab tests |
| Command runner, Git staging/commit and worktrees | workbench-ui.js | Actual local command/Git fixtures |
| Background task approvals and conversation reopening | workbench-ui.js, task-manager.cjs | Native task fixture |
| Project instructions, MCP config, skills and agent catalog | workbench-ui.js | Native workbench and validation tests |
| Recovery, undo snapshot, diagnostics and local update picker | productivity.js | Native maintenance and recovery tests |
| Light/dark, compact layout, keyboard dialogs and unsaved editor guard | app.css and UI modules | Visual inspection and native keyboard/editor tests |

File names in this table are under src/ unless a desktop backend is named.
The terminal remains a command runner rather than an embedded PTY.
Multimodal input, remote hosts and scheduled automations were not implemented in
0.5.0 and are not claimed as part of renderer parity. See CAPABILITIES.md.

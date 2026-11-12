# Data and network behavior

Relay Workbench keeps project references, preferences, local agent conversations,
project tool configuration, background tasks and recovery snapshots in the Windows
user profile. Existing installations retain the Boau Code profile directory.
Codex and other official tools may keep their own histories and credentials separately.
Removing the application keeps user data unless you remove it yourself.

The workbench renderer has no network access. When you send a task, the chosen
agent tool can transmit the prompt, attached file text, project context and tool results
to its configured provider. Provider terms and retention policies apply separately.
MCP servers and custom ACP tools are user-selected external programs or services.

Handoffs are editable drafts until explicitly sent. Login uses official tools and browser
flows; passwords and temporary authorization codes are not saved by the workbench.
Recovery snapshots and conversations can contain private code. Diagnostics are redacted,
but review an exported report before sharing it.

There is no workbench analytics service, cloud account, automatic catalog installation,
automatic model purchase or automatic update service in this preview.

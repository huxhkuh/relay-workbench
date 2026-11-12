# Security

Coding agents and terminal commands can change local files and execute processes with your user permissions.
MCP servers and ACP tools must be trusted. Worktrees isolate file changes, not OS privileges.
The renderer uses context isolation, restricted preload APIs and a content security policy.
Official tools manage credentials. Auth URLs are transient and excluded from status responses.

Only the latest preview is maintained; there is no response SLA. Use GitHub's private
vulnerability reporting on this repository to report security issues. Reporting is enabled at
https://github.com/huxhkuh/relay-workbench/security/advisories/new .
Do not include tokens, login URLs, private projects or exploit details in public issues.

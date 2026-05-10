# Security Policy

## Reporting a vulnerability

If you've found a security issue in clawster, please **do not** open a public
GitHub issue. Instead, email **hello@rekabytes.com** with:

- A description of the issue
- Steps to reproduce (or a proof of concept)
- The affected version or commit SHA
- Any suggested mitigation

You can expect:

- An acknowledgement within 3 business days
- A triage decision (accepted / needs more info / not in scope) within 7 days
- A coordinated disclosure timeline once a fix is available

## Scope

In scope:

- Authentication / authorization bypass
- Privilege escalation
- Remote code execution
- SQL injection, SSRF, path traversal
- Secrets leakage in logs, error messages, or API responses
- WhatsApp session credential exposure (the `WaSession.encrypted` field at rest)
- License-key bypass

Out of scope:

- Denial of service from a single client (rate-limited at the application layer)
- Issues only reproducible in a development build (`NODE_ENV=development`)
- Self-XSS that requires the victim to paste attacker-controlled JavaScript
- Reports about missing security headers without an exploit demonstrating impact

## Supported versions

Only the latest commit on `main` is supported. Older releases of the desktop
app are upgraded via the in-app updater (Tauri).

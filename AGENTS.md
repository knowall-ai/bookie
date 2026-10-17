# Agent Instructions

[CLAUDE.md](CLAUDE.md) is the full project guide and applies to every AI agent (Claude Code, Codex, Copilot, CodeRabbit), not just Claude.

## Public Repository: No Private Information

Never commit secrets, real email addresses, customer or supplier names, monetary amounts from real books, tenant/company/organisation GUIDs, logs, or screenshots of real data. Use the demo organisations (`BOOKIE_DEV_AUTH=demo`) or BC's CRONUS company, with fictional names (Contoso, Fabrikam, Northwind, `example.com`).

## Before you push

- `cd web && bun run check`
- Grep your diff for GUIDs, email addresses and currency amounts that did not come from the demo data.
- If something slips through: rotate any secret, rewrite the branch history, force-push, and tell a maintainer.

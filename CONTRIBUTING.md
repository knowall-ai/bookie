# Contributing to Bookie

Thanks for helping. Bookie is open source (MIT) and built by [KnowAll AI](https://knowall.ai).

## This repository is public

Bookie deals with real companies' accounts, so be strict about data:

- **Never commit** secrets, real client or supplier names, monetary amounts from real books, invoice numbers, tenant/company/organisation ids, email addresses, or logs.
- **Screenshots** come from the built-in demo organisations (`BOOKIE_DEV_AUTH=demo`) or Business Central's CRONUS company only.
- **Test data** is fictional: Contoso, Fabrikam, Northwind, `example.com`.
- **If something slips through:** rotate any secret, rewrite the branch so it never appears, force-push, and tell a maintainer so cached commits can be purged.

## Making a change

1. Read [CLAUDE.md](CLAUDE.md) for the architecture rules (connectors, tenant isolation, writes and confirmations).
2. `cd web && bun install && bun run dev` (http://localhost:3103). Use `BOOKIE_DEV_AUTH=demo` in `web/.env.development.local` to work against the demo organisations.
3. Add tests: unit tests next to the code (`*.test.ts`) and a Playwright spec in `web/tests/e2e/` for UI.
4. Run `bun run check` and `bun run test:e2e`.
5. Open a pull request against `main` using the template: conventional-commit title, Summary, Fixes, Test plan. CodeRabbit reviews every PR; address its comments.

## Adding a connector

A connector adapts one accounting system to `web/src/lib/domain/types.ts`. Implement the modules it supports under `web/src/lib/connectors/<name>/`, register it in `connectors/registry.ts`, and return `undefined` for modules the system can't provide: the portal hides or explains them automatically. See [docs/SOLUTION_DESIGN.adoc](docs/SOLUTION_DESIGN.adoc).

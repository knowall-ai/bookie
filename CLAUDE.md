# Claude Code Instructions for Bookie

## Project Overview

Bookie ([getbook.ie](https://getbook.ie)) is an open-source, Xero-style accounting portal. It reads and writes **Xero** and **Microsoft Dynamics 365 Business Central** through one domain model, behind Microsoft Entra sign-in, and includes **Bookie the AI bookkeeper**: in the portal (chat and voice) and as a Hermes agent with his own Microsoft 365 account who joins Teams calls.

Sibling products: [Thyme](https://github.com/knowall-ai/thyme) (Harvest on BC), [ZapDesk](https://github.com/knowall-ai/zapdesk) (Zendesk on DevOps), [Wardie](https://github.com/knowall-ai/wardie). Company: KnowAll AI Ltd.

## Public Repository: No Client Data

**This repository is public.** Never commit real client or customer data: names, amounts, invoice numbers, internal ids (tenant, company, org GUIDs), emails, or screenshots of real books.

- Screenshots and tests use the built-in **demo organisations** (`BOOKIE_DEV_AUTH=demo`: Contoso Coffee Roasters Ltd) or the BC **CRONUS** company. Fictional names only (Contoso, Fabrikam, Northwind, `example.com`).
- Live checks against real books (`scripts/smoke.ts`, `scripts/parity.ts`) print counts and pass/fail only, never amounts, and take ids from environment variables.
- If client data slips into a commit, rewrite the branch so it never appears, force-push, and ask GitHub to purge cached commits.

## Repository Layout

| Folder | What |
|---|---|
| `web/` | Next.js 16 app: public site at `/`, the portal at `/portal`. Bun, Tailwind 4, TypeScript. |
| `agent/` | Bookie the Hermes agent: SOUL, skills, voice (GPT-Live-1), Reverie and Agent Presence wiring, VM deploy scripts. |
| `infra/` | Azure Bicep and `az` scripts: App Service, Key Vault, Azure OpenAI, Bookie's VM. |
| `docs/` | AsciiDoc: SOLUTION_DESIGN, DEPLOYMENT, TESTING, SECURITY, TROUBLESHOOTING, PRIVACY, TERMS, and the hosted-agent isolation design. |

## Architecture Rules (web)

- **Connectors** (`web/src/lib/connectors/`) adapt one back end to the domain model in `web/src/lib/domain/types.ts`. The contract is `connectors/types.ts`. Every module is optional; read methods are required inside a module, writes are optional. The UI checks presence (`connector.quotes?.create`) instead of branching on `kind`. **Never import a connector from a page**; go through `orgContext()` (`lib/portal/context.ts`).
- One file per module per connector: `connectors/{xero,bc,demo}/modules/<module>.ts`. A module function returning `undefined` hides the feature.
- **No dummy data, no guessing.** Bookie runs over real books, so it never shows a figure, status, currency or date the source system didn't actually provide. Where the source doesn't provide something, the domain value is `undefined` (or the explicit `'unknown'` status) and the UI says so plainly ("Not available from Business Central", a `SourceNote`, or a "—" with the reason as a tooltip). Never estimate, infer or default it: no currency from the country, no 1 January financial year, no "open means fully unpaid", no 0% for a rate the source doesn't give, no converting currencies at a made-up rate, no counting unknown amounts as zero or as the full total. Bookie's tools mark such fields "not available" so the model can't fill them in. The demo connector's fictional data is only reachable with `BOOKIE_DEV_AUTH=demo`, which production refuses; public-site illustrations are labelled as illustrations.
- **Stateless.** Bookie never stores accounting data. The only things it persists are connection settings and secrets, sealed per tenant (`lib/config/crypto.ts`) and stored in the **customer's own SharePoint** (`lib/config/stores.ts`). Our tenant holds only the master key, in Key Vault.
- **Approved organisations only.** Only KnowAll's tenant and the tenant ids in `APPROVED_TENANT_IDS` can use the portal (`lib/auth/approved-tenants.ts`). `getAuthContext()`/`requireAuth()` return no user for anyone else, who is sent to `/not-approved`. Use `getSignIn()` only for that page.
- **Tenant isolation.** Everything is keyed by the Entra tenant id from the verified sign-in (`AuthContext.user.tenantId`), never by request input. Org keys in URLs are re-checked against `listOrgs()` on every request, which also applies per-person access (guests see only what they're granted; `docs/ACCESS.adoc`). Caches must include the tenant id in their key.
- **Writes** go through server actions in `lib/portal/actions/`, are validated with zod, re-resolve the org with `orgContext()`, and are confirmed in the UI with `ConfirmDialog` when they touch live books (approve, void, delete, email, payments).
- **Xero rules:** data from the Xero API must never be used to train or fine-tune AI models (Xero Developer Terms, March 2026). Bookie queries it live per question; Reverie stores conversations and preferences, not ledger data.
- UI: KnowAll dark theme tokens in `app/globals.css` (`bg-surface`, `text-muted`, `border-line`, `text-brand`...). Reuse `components/ui/*` and `components/documents/*`. Money with `<Money>`/`formatMoney`, dates with `formatDate` (en-GB). Xero's vocabulary and tab order (`lib/portal/nav.ts`).

## Development Commands (run in `web/`)

```bash
bun install
bun run dev            # http://localhost:3103
bun run check          # format, lint, typecheck, unit tests, build
bun run test           # vitest
bun run test:e2e       # Playwright against the demo organisations
bun --conditions=react-server scripts/smoke.ts   # live Xero/BC smoke (see header for env vars)
```

Dev sign-in shortcuts (`web/.env.development.local`, refused in production builds):

- `BOOKIE_DEV_AUTH=azure-cli`: act as the Azure CLI user (real data, no interactive login).
- `BOOKIE_DEV_AUTH=demo`: the fictional demo user and demo organisations.
- `BOOKIE_DEV_AUTH=demo-guest`: a fictional guest accountant who can see one demo organisation (see `docs/ACCESS.adoc`).
- `BOOKIE_DEV_AUTH=demo-unapproved`: a fictional Fabrikam user whose organisation isn't approved, so they see only the "not set up yet" page.
- `BOOKIE_CONFIG_STORE=file`: keep sealed settings in `.bookie-config/` instead of SharePoint.

After switching branches: `rm -rf .next && bun run dev`.

## Definition of Done

1. `bun run check` passes.
2. New behaviour has unit tests (mappers, actions) and, for UI, a Playwright test on the demo org.
3. Docs updated in `docs/` when behaviour, setup or architecture changes.
4. PR title uses a conventional-commit prefix; body has Summary, Fixes, and a Test plan. Screenshots from the demo org only.
5. CodeRabbit review addressed (fallback: a GPT-6.1-Sol review via `codex-review` when CodeRabbit is rate-limited).

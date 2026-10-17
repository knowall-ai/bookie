<p align="center">
  <img alt="Bookie, the AI bookkeeper, at his desk with a glowing ledger" src="web/public/bookie/banner.webp" width="100%">
</p>

<h1 align="center">Bookie</h1>

<p align="center">
  <strong>Clear books, and a bookkeeper who never clocks off.</strong><br>
  A familiar, Xero-style portal over <strong>Xero</strong> or <strong>Microsoft Dynamics 365 Business Central</strong>, with Bookie the AI bookkeeper built in.
</p>

<p align="center">
  <a href="https://getbook.ie">getbook.ie</a> ·
  <a href="docs/SOLUTION_DESIGN.adoc">Solution design</a> ·
  <a href="docs/AGENT.adoc">Bookie agent</a> ·
  <a href="docs/DEPLOYMENT.adoc">Deployment</a> ·
  <a href="CONTRIBUTING.md">Contributing</a>
</p>

<p align="center">
  <a href="https://github.com/knowall-ai/bookie/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/knowall-ai/bookie/actions/workflows/ci.yml/badge.svg"></a>
  <a href="https://coderabbit.ai"><img alt="CodeRabbit Pull Request Reviews" src="https://img.shields.io/coderabbit/prs/github/knowall-ai/bookie?label=CodeRabbit+Reviews&labelColor=171717&color=FF570A"></a>
  <img alt="Licence: MIT" src="https://img.shields.io/badge/licence-MIT-blue.svg">
</p>

---

Bookie is **free and open source** from [KnowAll AI](https://knowall.ai), a sibling of [Thyme](https://github.com/knowall-ai/thyme) (Harvest-style time tracking on Business Central) and [ZapDesk](https://github.com/knowall-ai/zapdesk) (Zendesk-style support on Azure DevOps and GitHub).

## Features

**A portal that feels like Xero.** Home, Sales, Purchases, Reporting, Accounting, Payroll, Projects and Contacts, with Xero's vocabulary, status tabs and layouts, in the KnowAll dark theme.

**Xero or Business Central, same screens.** Each organisation can live in either system. Turn each connector on or off in Settings.

- **Xero:** connect with "Connect to Xero" (OAuth 2.0, many organisations in one go) or paste Custom Connection keys. Add as many as you like.
- **Business Central:** found automatically with your own Microsoft sign-in and permissions, across every environment and company you can reach.
- **More to come:** connectors are a defined interface, so full Dynamics 365 Finance or a ledger kept in your own SharePoint can be added without touching the screens.

**Built for accountants.** Every organisation you can reach appears in one switcher. Move between clients' books in a click; there is no blending of one client's data with another's.

**Full read and write.** Draft, approve, email and void invoices and bills; quotes, purchase orders, contacts, payments, bank transactions and manual journals. Anything that posts to the books asks you to confirm first.

**Bookie, the AI bookkeeper.**

- **In the portal:** ask him anything about the open organisation ("who owes us the most?"). He looks it up live and explains it, and gives his take on the Home page.
- **By voice:** talk to him in the browser, or **call him on Teams**.
- **As a Hermes agent:** he has his own Microsoft 365 account, joins Teams calls with [Agent Presence](https://github.com/knowall-ai/agent-presence) using **GPT-Live-1**, and remembers people and context with [Reverie](https://github.com/knowall-ai/hermes-reverie).

**Your data stays yours.**

- **Nothing stored:** Bookie never stores your accounts; it reads Xero and Business Central live.
- **Settings in your own tenant:** the only thing it keeps is your connection settings, encrypted with a per-organisation key and stored in your own Microsoft 365 (a hidden SharePoint list).
- **No AI training:** data from Xero is never used to train AI.

## How it fits together

```
 Browser ──► getbook.ie (Next.js on Azure App Service)
               │  Microsoft Entra sign-in (multi-tenant)
               ├─► Xero API                (OAuth or Custom Connection, per organisation)
               ├─► Business Central API    (as the signed-in user)
               ├─► SharePoint (your tenant) sealed connection settings, never accounts
               └─► Azure OpenAI            Bookie chat and voice (no training on your data)

 Teams ──► Bookie agent (Hermes on his own Azure VM)
               ├─ Agent Presence: Teams calls, GPT-Live-1 voice, avatar
               ├─ Reverie: memory of people and conversations (no ledger data)
               └─ Xero skill + Business Central MCP
```

## Repository layout

| Folder | What |
|---|---|
| [`web/`](web) | The website and portal (Next.js 16, Bun, Tailwind 4, TypeScript) |
| [`agent/`](agent) | Bookie the Hermes agent: identity, skills, voice, memory, VM deployment |
| [`infra/`](infra) | Azure deployment for the web app (App Service, Key Vault, Azure OpenAI) |
| [`docs/`](docs) | Solution design, deployment, testing, security, agent and hosted-agent isolation |

## Quick start

```bash
cd web
bun install
cp .env.example .env.local           # fill in the Entra app and secrets
echo "BOOKIE_DEV_AUTH=demo" > .env.development.local   # fictional demo organisations
bun run dev                           # http://localhost:3103
```

To use real books in development, see [docs/DEPLOYMENT.adoc](docs/DEPLOYMENT.adoc) for the Entra app registration, then remove `BOOKIE_DEV_AUTH` and sign in with Microsoft.

## Checks

```bash
bun run check        # format, lint, typecheck, unit tests, production build
bun run test:e2e     # Playwright on the demo organisations, desktop and mobile
bun run parity       # live: Bookie's numbers vs the source system's own reports (no amounts printed)
```

## Licence

MIT, see [LICENSE](LICENSE). "Bookie" and the Bookie character are trademarks of KnowAll AI Ltd; see [TRADEMARKS.md](TRADEMARKS.md). Not affiliated with Xero or Microsoft.

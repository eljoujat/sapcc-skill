# sapcc-skill — SAP Commerce Cloud Agent Skill

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/eljoujat/sapcc-skill?style=flat&logo=github)](https://github.com/eljoujat/sapcc-skill/stargazers)
[![GitHub forks](https://img.shields.io/github/forks/eljoujat/sapcc-skill?style=flat&logo=github)](https://github.com/eljoujat/sapcc-skill/network/members)
[![Latest Release](https://img.shields.io/github/v/release/eljoujat/sapcc-skill?logo=github)](https://github.com/eljoujat/sapcc-skill/releases/latest)
[![Last Commit](https://img.shields.io/github/last-commit/eljoujat/sapcc-skill?logo=github)](https://github.com/eljoujat/sapcc-skill/commits/main)
[![Agent Skills](https://img.shields.io/badge/Agent%20Skills-compatible-2ea44f)](https://agentskills.io)
[![npm](https://img.shields.io/badge/powered%20by-sapcc--hac--client-blue)](https://www.npmjs.com/package/sapcc-hac-client)
[![npm](https://img.shields.io/badge/powered%20by-sapcc--portal--cli-blue)](https://www.npmjs.com/package/sapcc-portal-cli)

**English** · [العربية](README_AR.md)

A skill that turns natural-language requests into **Groovy scripts**, **FlexibleSearch queries**, or **Cloud Portal API calls** and executes them live on a SAP Commerce Cloud (Hybris / CCv2) instance. The agent automatically picks the right tool based on your intent — no manual query writing needed. Built on top of [`sapcc-hac-client`](https://www.npmjs.com/package/sapcc-hac-client) (HAC: application data & business logic) and [`sapcc-portal-cli`](https://www.npmjs.com/package/sapcc-portal-cli) (Cloud Portal: builds, deployments, environments, backups, scaling, certificates...).

Works with **Claude Code, Cursor, GitHub Copilot, Codex, Pi** and any agent compatible with the [Agent Skills](https://agentskills.io) format.

---

## ✨ Highlights

- 🧠 **Smart routing** — the agent automatically decides between FlexibleSearch (data queries), Groovy (business logic, writes, service calls), and the Cloud Portal API (DevOps operations) based on your request
- 🔍 **FlexibleSearch** — query any SAP CC type with SELECT/JOIN/WHERE; results returned as structured rows
- 🛠️ **Groovy scripts** — call Spring services (`productService`, `orderService`…), trigger cronjobs, run ImpEx, or modify data with `--commit`
- ☁️ **Cloud Portal operations** — manage environments, builds, deployments (rolling/recreate/canary), backups & restores, scaling, endpoints, SSL certificates, scheduled activities, service properties and user roles
- 🔐 **Secure by design** — credentials live in `.env`, never hardcoded; `.env` is gitignored
- 📊 **Structured JSON output** — every response is valid JSON for reliable agent parsing and Markdown table rendering
- ⚡ **Health check** — one command per client to verify connectivity and credentials before anything else
- 📚 **Rich reference docs** — decision guide, FlexSearch syntax, Groovy patterns, SAP CC type reference, and Cloud Portal command guide all bundled

---

## 🚀 Installation

### 1. Install the skill

```bash
# Any agent (Claude Code, Cursor, Copilot, Pi, ...)
npx skills add github:eljoujat/sapcc-skill
```

```bash
# Manual install — Pi
git clone https://github.com/eljoujat/sapcc-skill.git \
  ~/.pi/agent/skills/sapcc-skill
cd ~/.pi/agent/skills/sapcc-skill && npm install
```

```bash
# Manual install — Claude Code / Codex
git clone https://github.com/eljoujat/sapcc-skill.git \
  ~/.claude/skills/sapcc-skill
cd ~/.claude/skills/sapcc-skill && npm install
```

### 2. Configure credentials

Create a `.env` file in your **project root** (the skill also accepts one in its own directory as fallback):

```bash
cp ~/.pi/agent/skills/sapcc-skill/.env.example .env
```

Fill in your values:

```env
HAC_URL=https://backoffice.your-instance.commerce.ondemand.com
HAC_USERNAME=admin
HAC_PASSWORD=your_secure_password
HAC_IGNORE_SSL=false      # set true for self-signed / dev certificates
HAC_TIMEOUT=30000         # ms; increase for slow instances

# Cloud Portal API (optional, only needed for scripts/portal.js)
PORTAL_API_URL=https://portalapi.commerce.ondemand.com/v2
PORTAL_SUBSCRIPTION_CODE=your_subscription_code
PORTAL_TOKEN_ENDPOINT=https://ycloud.accounts.ondemand.com/oauth2/token
PORTAL_CLIENT_ID=your_client_id
PORTAL_CLIENT_SECRET=your_client_secret
PORTAL_RESOURCE=your_resource_urn
```

### 3. Verify

```bash
node <skill-dir>/scripts/setup.js                      # checks deps + .env (HAC & Portal)
node <skill-dir>/scripts/execute.js --health-check     # tests HAC authentication
node <skill-dir>/scripts/portal.js --health-check      # tests Cloud Portal authentication
```

---

## ⚡ Quick Start

Once installed, just ask the agent naturally:

> *"Show me the 10 most recent orders"*
> *"Find the product with code LAPTOP_001 and its price entries"*
> *"How many active products are in the electronics catalog?"*
> *"List all customers with login disabled"*
> *"Trigger the full Solr reindex cronjob"*
> *"Run an ImpEx to update the stock level for SKU ABC-123"*
> *"List all CCv2 environments and their deployment status"*
> *"Create a build from the develop branch and deploy it to staging"*
> *"Take a backup of production before the next release"*
> *"Scale the storefront service to 4 replicas on prod"*

The skill plans, executes, and returns results — no SQL, Groovy or Cloud Portal API knowledge required.

---

## 🗺️ How the Agent Decides: FlexSearch vs Groovy vs Cloud Portal

| Use **FlexibleSearch** when… | Use **Groovy** when… | Use **Cloud Portal** when… |
|---|---|---|
| Pure data retrieval (SELECT) | Business service calls (ProductService, OrderService…) | Listing/inspecting environments |
| Simple WHERE conditions | Multi-step / conditional logic | Builds & deployments |
| Counting / listing items | Writes, creates, updates, deletes | Backups, restores, scaling |
| Joining SAP CC types | Running ImpEx programmatically | Endpoints, certificates |
| Checking attribute values | Triggering cronjobs / business processes | Scheduled activities, properties, roles |
| Fast, read-only exploration | Complex calculations or transformations | Any CCv2 DevOps / platform operation |

Full decision matrix in [references/decision-guide.md](references/decision-guide.md) and the full Cloud Portal command reference in [references/portal-guide.md](references/portal-guide.md).

---

## 🔧 Direct CLI Usage

The skill exposes a thin CLI in `scripts/execute.js`:

```bash
# FlexibleSearch query
node <skill-dir>/scripts/execute.js \
  --type flexsearch \
  --query "SELECT {pk},{code},{name[en]} FROM {Product} WHERE {code} LIKE '%LAPTOP%'" \
  --max-count 50

# Groovy (read-only)
node <skill-dir>/scripts/execute.js \
  --type groovy \
  --script "def ps = spring.getBean('productService'); return ps.class.simpleName"

# Groovy from file — with DB commit
node <skill-dir>/scripts/execute.js \
  --type groovy \
  --file /path/to/script.groovy \
  --commit

# Force JSON output (for programmatic use)
node <skill-dir>/scripts/execute.js --type flexsearch --query "..." --json

# Health check
node <skill-dir>/scripts/execute.js --health-check
```

### Response format

**FlexibleSearch:**
```json
{
  "success": true,
  "resultCount": 42,
  "executionTime": 123,
  "headers": ["PK", "p_code", "p_name"],
  "rows": [["8796093055058", "LAPTOP_001", "Laptop Pro"]]
}
```

**Groovy:**
```json
{
  "success": true,
  "executionResult": "DefaultProductService",
  "outputText": "Processing...\n",
  "stacktrace": ""
}
```

---

## ☁️ Cloud Portal CLI Usage

For CCv2 DevOps operations, use `scripts/portal.js` (wraps [`sapcc-portal-cli`](https://www.npmjs.com/package/sapcc-portal-cli)):

```bash
# List environments
node <skill-dir>/scripts/portal.js environments list

# Build & deploy (rolling update)
node <skill-dir>/scripts/portal.js builds create --branch develop --name release-2.5.0
node <skill-dir>/scripts/portal.js builds progress <buildCode>
node <skill-dir>/scripts/portal.js deployments create --build-code <buildCode> --environment-code staging \
  --db-mode UPDATE --strategy ROLLING_UPDATE
node <skill-dir>/scripts/portal.js deployments progress <deploymentCode>

# Canary (GREEN) deployment + decision
node <skill-dir>/scripts/portal.js deployments create --build-code <buildCode> --environment-code prod \
  --db-mode UPDATE --strategy GREEN
node <skill-dir>/scripts/portal.js deployments decision <deploymentCode> --decision ACCEPT --reason "Validated on staging"

# Backup before a risky deployment
node <skill-dir>/scripts/portal.js backups create prod --description "Before release-2.5.0" --type STANDARD

# Scale a service
node <skill-dir>/scripts/portal.js scaling update prod --service storefront --replicas 4 --memory-scale-factor 1.5

# Health check
node <skill-dir>/scripts/portal.js --health-check
```

Every command outputs JSON, same convention as `execute.js`:

```json
{ "success": true, "data": { "...": "Cloud Portal API payload" } }
```
```json
{ "success": false, "error": "...", "detail": "..." }
```

Full command reference (all resources: environments, builds, deployments, endpoints, backups, scaling,
certificates, activities, properties, roles) in [references/portal-guide.md](references/portal-guide.md).

---

## 🔄 How it Works

```
User request
     │
     ▼
Agent analyzes intent
     │
     ├── data query? ──► FlexibleSearch query ──► scripts/execute.js ──► sapcc-hac-client ──► HAC (CSRF + session)
     ├── logic / write? ─► Groovy script ───────► scripts/execute.js ──► sapcc-hac-client ──► HAC (CSRF + session)
     └── DevOps op? ────► Cloud Portal call ───► scripts/portal.js ──► sapcc-portal-cli ──► Cloud Portal API (OAuth2)
                                                                                   │
                                                                             JSON result
                                                                                   │
                                                                     Agent formats & presents
```

The HAC authentication flow (CSRF token, JSESSIONID, ROUTE cookie) is fully managed by [`sapcc-hac-client`](https://www.npmjs.com/package/sapcc-hac-client). The Cloud Portal OAuth2 client_credentials flow (token acquisition, caching, 401 retry) is fully managed by [`sapcc-portal-cli`](https://www.npmjs.com/package/sapcc-portal-cli).

---

## 📚 Reference Files

The skill loads these on-demand when needed:

| File | When the agent reads it |
|---|---|
| [references/decision-guide.md](references/decision-guide.md) | Complex cases where FlexSearch vs Groovy is ambiguous |
| [references/flexsearch-guide.md](references/flexsearch-guide.md) | FlexibleSearch syntax, type names, join examples, caveats |
| [references/groovy-patterns.md](references/groovy-patterns.md) | Spring bean names, service patterns, ImpEx, cronjobs |
| [references/sap-cc-types.md](references/sap-cc-types.md) | SAP CC type reference (Product, Order, User, StockLevel…) |
| [references/portal-guide.md](references/portal-guide.md) | Cloud Portal command reference: builds, deployments, environments, backups, scaling, endpoints, certificates, activities, properties, roles |

---

## 🏗️ Project Structure

```
sapcc-skill/
├── SKILL.md                    # Agent Skills definition (loaded by any compatible agent)
├── package.json                # Dependencies: sapcc-hac-client, sapcc-portal-cli
├── .env.example                # Credentials template (HAC_* + PORTAL_*)
├── .gitignore                  # Excludes .env and node_modules
├── README.md                   # This file (English)
├── README_AR.md                # Arabic / العربية
├── scripts/
│   ├── execute.js              # CLI: FlexSearch | Groovy execution (HAC)
│   ├── portal.js               # CLI: Cloud Portal API operations (builds, deployments, ...)
│   └── setup.js                # Dependency + .env health checker (HAC & Portal)
└── references/
    ├── decision-guide.md       # FlexSearch vs Groovy matrix
    ├── flexsearch-guide.md     # FlexibleSearch syntax + 30+ examples
    ├── groovy-patterns.md      # Groovy + Spring bean patterns
    ├── sap-cc-types.md         # SAP CC type reference
    └── portal-guide.md         # Cloud Portal command reference & workflows
```

---

## 🤝 Agent Compatibility

| Agent | Supported | Install path |
|---|---|---|
| **Pi** | ✅ | `~/.pi/agent/skills/sapcc-skill/` |
| **Claude Code** | ✅ | `~/.claude/skills/sapcc-skill/` |
| **Cursor** | ✅ | `~/.cursor/skills/sapcc-skill/` |
| **GitHub Copilot** | ✅ | `.github/skills/sapcc-skill/` |
| **Codex** | ✅ | `~/.codex/skills/sapcc-skill/` |
| **OpenClaw / Hermes** | ✅ | `~/.agents/skills/sapcc-skill/` |
| Any [Agent Skills](https://agentskills.io)-compatible agent | ✅ | Per-agent skills directory |

---

## 🔒 .env Resolution Order

The script resolves credentials in this order (first match wins):

1. `--env-file <path>` — explicit CLI argument
2. `.env` in the current working directory (`process.cwd()`)
3. `.env` in the skill directory itself
4. Environment variables already set in the shell (CI/CD)

---

## 🐛 Troubleshooting

| Error | Fix |
|---|---|
| `Missing required environment variables` (HAC) | Fill in `.env` with HAC_URL, HAC_USERNAME, HAC_PASSWORD |
| `Missing required environment variables: PORTAL_...` | Fill in `.env` with PORTAL_SUBSCRIPTION_CODE, PORTAL_TOKEN_ENDPOINT, PORTAL_CLIENT_ID, PORTAL_CLIENT_SECRET, PORTAL_RESOURCE |
| `Authentification échouée` (HAC) | Check credentials; try `--health-check`; verify HAC URL |
| `OAuth2 token request failed` (Portal) | Check `PORTAL_TOKEN_ENDPOINT` / client id & secret / resource URN |
| `HTTP 403` | The HAC user lacks scripting/console permissions, or the Portal client lacks subscription rights |
| `ECONNREFUSED` / `ETIMEDOUT` | Check network; try `HAC_IGNORE_SSL=true` for dev (HAC only) |
| FlexSearch syntax error | Check type names and attribute aliases in [flexsearch-guide.md](references/flexsearch-guide.md) |
| Groovy `MissingMethodException` | Verify bean name in [groovy-patterns.md](references/groovy-patterns.md) |
| `sapcc-hac-client not found` | Run `npm install` in the skill directory |
| `sapcc-portal-cli not found` | Run `npm install` in the skill directory |
| `Unknown command` (portal.js) | Check the command reference in [portal-guide.md](references/portal-guide.md) |

---

## 📄 License

MIT © [Youssef El Jaoujat](https://github.com/eljoujat)

---

<sub>Powered by <a href="https://www.npmjs.com/package/sapcc-hac-client">sapcc-hac-client</a> & <a href="https://www.npmjs.com/package/sapcc-portal-cli">sapcc-portal-cli</a> · Compatible with the <a href="https://agentskills.io">Agent Skills</a> standard</sub>

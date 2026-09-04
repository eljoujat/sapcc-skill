# AGENTS.md

> This file helps AI agents (Claude, Copilot, Cursor, Codex, Pi, Gemini…) understand this codebase quickly and work on it effectively.
> Following the [agents.md](https://agents.md) standard.

---

## Project Overview

**`sapcc-skill`** is an [Agent Skills](https://agentskills.io)-compatible skill that lets any AI agent interact with a **SAP Commerce Cloud (Hybris / CCv2)** instance using natural language, across two complementary surfaces:

1. **HAC (Hybris Administration Console)** — application data & business logic. The agent translates intent into either:
   - a **FlexibleSearch query** (SQL-like, read-only, fast)
   - a **Groovy script** (business logic, service calls, writes, ImpEx, cronjobs)

   …executed via **[`sapcc-hac-client`](https://www.npmjs.com/package/sapcc-hac-client)** (handles HAC authentication: CSRF token, JSESSIONID, ROUTE cookie).

2. **Cloud Portal API** — CCv2 DevOps/platform operations (environments, builds, deployments, backups, scaling,
   endpoints, certificates, scheduled activities, service properties, user roles), executed via
   **[`sapcc-portal-cli`](https://www.npmjs.com/package/sapcc-portal-cli)** (handles OAuth2 client_credentials auth).

The skill is designed to keep growing with additional SAP CC capabilities over time (monitoring, etc.).

---

## Repository Structure

```
sapcc-skill/
├── SKILL.md                          # Agent Skills manifest — name, description, metadata
├── package.json                      # npm package (name: sapcc-skill, v2.1.0)
├── .env.example                      # Credentials template (HAC_* and PORTAL_*)
├── .gitignore                        # Excludes .env, node_modules, *.stamp
│
├── scripts/
│   ├── execute.js                    # ★ HAC ENTRY POINT — Groovy / FlexSearch CLI runner
│   ├── portal.js                     # ★ CLOUD PORTAL ENTRY POINT — builds/deployments/envs/... CLI runner
│   └── setup.js                      # Setup health checker (deps + .env validation, both HAC & Portal)
│
├── references/                       # Agent-readable reference docs (loaded on demand)
│   ├── decision-guide.md             # FlexSearch vs Groovy decision matrix
│   ├── flexsearch-guide.md           # FlexibleSearch syntax, types, 30+ example queries
│   ├── groovy-patterns.md            # Groovy patterns, Spring bean names, service examples
│   ├── sap-cc-types.md               # SAP CC type reference (Product, Order, User…)
│   └── portal-guide.md               # Cloud Portal command reference & DevOps workflows
│
├── .github/
│   ├── ISSUE_TEMPLATE/
│   │   ├── bug_report.md
│   │   └── feature_request.md
│   └── PULL_REQUEST_TEMPLATE.md
│
├── CODE_OF_CONDUCT.md
├── CONTRIBUTING.md
├── SECURITY.md
├── LICENSE                           # MIT
├── README.md                         # English documentation
└── README_AR.md                      # Arabic documentation
```

---

## Key File: `scripts/execute.js`

This is the **only entry point** for the skill. It is a self-contained Node.js CLI with **no build step**.

### Execution flow

```
execute.js invoked
      │
      ├─ ensureDeps()           Auto-installs npm deps on first run (stamp file prevents repeat)
      │
      ├─ Parse argv             Custom arg parser (no external dep like yargs/commander)
      │
      ├─ Load .env              Resolution order:
      │                           1. --env-file <path>
      │                           2. process.cwd()/.env
      │                           3. <skill-dir>/.env
      │                           4. Shell environment variables (CI/CD)
      │
      ├─ createClient()         Instantiates sapcc-hac-client with HAC_URL/USERNAME/PASSWORD
      │
      ├─ --health-check?  ──►  client.authenticate() → JSON result
      │
      ├─ --type flexsearch ──►  client.executeFlexSearch(query, { maxCount, user, locale })
      │
      └─ --type groovy     ──►  client.executeGroovy(script, { commit, scriptType })
```

### CLI flags

| Flag | Type | Default | Description |
|---|---|---|---|
| `--type` | `groovy` \| `flexsearch` | — | **Required** (unless `--health-check`) |
| `--query` | string | — | FlexibleSearch query string |
| `--script` | string | — | Inline Groovy script |
| `--file` | path | — | Path to a `.groovy` file (alternative to `--script`) |
| `--commit` | boolean flag | `false` | Commit DB transaction (Groovy writes only) |
| `--max-count` | number | `200` | Max rows for FlexSearch results |
| `--locale` | string | `en` | Locale for localized FlexSearch attributes |
| `--user` | string | `admin` | SAP CC user context for FlexSearch |
| `--script-type` | `groovy` \| `beanshell` | `groovy` | Script engine |
| `--json` | boolean flag | `false` | Force raw JSON output |
| `--env-file` | path | — | Explicit `.env` file path |
| `--health-check` | boolean flag | `false` | Test authentication only |

### Output format

**All output is JSON on stdout.** Errors also exit with `process.exit(1)` and a JSON payload.

```jsonc
// FlexSearch success
{
  "success": true,
  "resultCount": 42,
  "executionTime": 123,
  "headers": ["pk", "code", "name[en]"],
  "rows": [["8796093055058", "LAPTOP_001", "Laptop Pro"]]
}

// Groovy success
{
  "success": true,
  "executionResult": "DefaultProductService",
  "outputText": "Processing...\n",
  "stacktrace": ""
}

// Any error
{
  "success": false,
  "error": "Human-readable message",
  "detail": "Optional stack or hint"
}
```

### Auto-install mechanism

`ensureDeps()` runs synchronously at startup:
1. Checks for `node_modules/.sapcc-hac-installed` stamp → skip if exists
2. Checks for `node_modules/sapcc-hac-client` → write stamp and skip
3. Otherwise runs `npm install --prefer-offline --no-audit --no-fund --loglevel=error`
4. Writes stamp on success

**Never call `npm install` manually** — it is handled automatically.

---

## Key File: `scripts/portal.js`

Cloud Portal counterpart of `execute.js`, delegating to **`sapcc-portal-cli`**. Same conventions: JSON-only
output, auto-install (`node_modules/.sapcc-portal-installed` stamp), `.env` resolution order identical to
`execute.js` but for `PORTAL_*` variables.

### Command shape

```
node portal.js <resource> <action> [positional args...] [--flags]
node portal.js --health-check
```

Resources: `environments`, `builds`, `deployments`, `endpoints`, `backups`, `scaling`, `certificates`,
`activities`, `properties`, `roles`. Each resource/action pair maps 1:1 to a `PortalClient` method
(see `references/portal-guide.md` for the full command table and `node_modules/sapcc-portal-cli/src/PortalClient.js`
for the underlying REST calls).

### Output format

```jsonc
// Success
{ "success": true, "data": { /* raw Cloud Portal API payload */ } }

// Error
{ "success": false, "error": "Human-readable message", "detail": "Optional hint" }
```

### Health check

`--health-check` performs a lightweight `listEnvironments({})` call to validate OAuth2 credentials without
any side effects.

---

## Key File: `scripts/setup.js`

A diagnostic tool (not used at runtime). Checks:
1. Node.js >= 18
2. `sapcc-hac-client` resolvable
3. `sapcc-portal-cli` resolvable
4. `dotenv` resolvable
5. `.env` file exists with `HAC_URL`, `HAC_USERNAME`, `HAC_PASSWORD` set (required) and `PORTAL_*` vars (warns only if missing)

Run it when troubleshooting a broken environment.

---

## Key File: `SKILL.md`

The **Agent Skills manifest**. Loaded by any compatible agent at skill discovery time.

Critical fields:
- `name: sapcc-skill` — the skill identifier (must match directory name for Pi)
- `description:` — used by the agent to decide when to activate this skill
- `metadata.version` — currently `2.1.0`
- `metadata.homepage` — `https://github.com/eljoujat/sapcc-skill`

**When updating the skill's behavior, update the `description` in `SKILL.md` too** — agents use it for routing.

---

## Environment Variables

### HAC (`sapcc-hac-client`) — required for `scripts/execute.js`

| Variable | Required | Description |
|---|---|---|
| `HAC_URL` | ✅ | Base URL of the HAC, e.g. `https://backoffice.xxx.commerce.ondemand.com` — no trailing slash |
| `HAC_USERNAME` | ✅ | HAC admin username |
| `HAC_PASSWORD` | ✅ | HAC admin password |
| `HAC_IGNORE_SSL` | optional | `true` to skip SSL verification (dev/self-signed only) |
| `HAC_TIMEOUT` | optional | Request timeout in ms (default: `30000`) |
| `HAC_DEBUG` | optional | `true` to log which `.env` file was loaded (to stderr) |

### Cloud Portal (`sapcc-portal-cli`) — required for `scripts/portal.js`

| Variable | Required | Description |
|---|---|---|
| `PORTAL_API_URL` | optional | Cloud Portal API base URL (default: `https://portalapi.commerce.ondemand.com/v2`) |
| `PORTAL_SUBSCRIPTION_CODE` | ✅ | CCv2 subscription code |
| `PORTAL_TOKEN_ENDPOINT` | ✅ | OAuth2 token endpoint |
| `PORTAL_CLIENT_ID` | ✅ | OAuth2 client id |
| `PORTAL_CLIENT_SECRET` | ✅ | OAuth2 client secret |
| `PORTAL_RESOURCE` | ✅ | OAuth2 resource URN |
| `PORTAL_TIMEOUT` | optional | Request timeout in ms (default: `30000`) |
| `PORTAL_DEBUG` | optional | `true` for verbose HTTP logging |

**Security rule: `.env` must never be committed.** The `.gitignore` excludes it. Never hardcode credentials.

---

## Dependencies

| Package | Role |
|---|---|
| [`sapcc-hac-client`](https://www.npmjs.com/package/sapcc-hac-client) | Authenticates with HAC (CSRF + cookies) and runs FlexSearch / Groovy |
| [`sapcc-portal-cli`](https://www.npmjs.com/package/sapcc-portal-cli) | Authenticates with the Cloud Portal API (OAuth2 client_credentials) and runs all Portal operations |
| [`dotenv`](https://www.npmjs.com/package/dotenv) | Loads `.env` files |

No build tool, no TypeScript, no bundler. Plain Node.js CommonJS.

---

## How the Agent Should Use This Skill

### Step 1 — Classify the request

| Condition | Use |
|---|---|
| Pure data retrieval (SELECT-style) | `flexsearch` |
| Business logic, service calls | `groovy` |
| Any write / update / delete | `groovy --commit` |
| Triggering cronjob / ImpEx / business process | `groovy` |
| Ambiguous → try FlexSearch first | If insufficient, escalate to Groovy |

→ Full matrix: [`references/decision-guide.md`](references/decision-guide.md)

### Step 2 — Compose the query or script

**FlexSearch rules:**
- Wrap all attributes in `{}`: `{p:code}`, `{o:totalPrice}`
- Use double braces `{{ }}` for subqueries
- Filter orders/carts with `{versionID} IS NULL` to exclude saved-cart versions
- Localized attributes: `{name[en]}` not `{name}`
- Max rows default 200 — increase with `--max-count` for bulk exports

→ Syntax guide: [`references/flexsearch-guide.md`](references/flexsearch-guide.md)

**Groovy rules:**
- Access Spring beans via `spring.getBean('beanName')`
- `println` → goes to `outputText`; `return` → goes to `executionResult`
- Always wrap in try/catch to surface clean error messages
- Only pass `--commit` when the script modifies data
- Never hardcode credentials in scripts

→ Patterns: [`references/groovy-patterns.md`](references/groovy-patterns.md)

### Step 3 — Execute

```bash
# FlexSearch
node <skill-dir>/scripts/execute.js \
  --type flexsearch \
  --query "SELECT {pk},{code} FROM {Product} WHERE {code}='MY_CODE'"

# Groovy (read)
node <skill-dir>/scripts/execute.js \
  --type groovy \
  --script "return spring.getBean('productService').class.simpleName"

# Groovy (write)
node <skill-dir>/scripts/execute.js \
  --type groovy --commit \
  --script "..."

# From file
node <skill-dir>/scripts/execute.js --type groovy --file /tmp/my-script.groovy

# Health check
node <skill-dir>/scripts/execute.js --health-check
```

### Step 4 — Interpret results

- `success: false` → show `error` + `detail`; do not silently swallow
- `resultCount: 0` → suggest refined query (check type names, catalog filter, `versionID IS NULL`)
- `stacktrace` non-empty → show it; common causes: wrong bean name, missing `--commit`, wrong catalog version
- Present `headers` + `rows` as a Markdown table when available

---

## How the Agent Should Use the Cloud Portal Path (`scripts/portal.js`)

### Step 1 — Recognize a Portal request

Vocabulary cues: "deploy", "build", "environment", "scale/scaling", "backup/restore", "certificate",
"endpoint", "maintenance window", "role/permission" on an environment. These map to `portal.js`, not `execute.js`.

→ Full command reference & workflows: [`references/portal-guide.md`](references/portal-guide.md)

### Step 2 — Compose the command

```
node <skill-dir>/scripts/portal.js <resource> <action> [positional args] [--flags]
```

Resource/action pairs mirror the `sccp` CLI 1:1 (environments, builds, deployments, endpoints, backups,
scaling, certificates, activities, properties, roles).

### Step 3 — Execute

```bash
# List environments
node <skill-dir>/scripts/portal.js environments list

# Build & deploy
node <skill-dir>/scripts/portal.js builds create --branch develop --name release-2.5.0
node <skill-dir>/scripts/portal.js deployments create --build-code <c> --environment-code staging \
  --db-mode UPDATE --strategy ROLLING_UPDATE

# Health check
node <skill-dir>/scripts/portal.js --health-check
```

### Step 4 — Interpret results & safety

- `success: false` → show `error` + `detail`
- Confirm before destructive actions: deletes, `REJECT` decisions, production deployments
- Suggest a backup before deploying to production-like environments if the user didn't request one
- `deployments create --strategy GREEN` always needs a follow-up `deployments decision` call

---

## Common SAP CC Types Quick Reference

| Type | Primary key query pattern |
|---|---|
| `Product` | `WHERE {code}='...'` |
| `Order` | `WHERE {code}='...' AND {versionID} IS NULL` |
| `Customer` | `WHERE {uid}='email@example.com'` |
| `CronJob` | `WHERE {code}='...'` |
| `CatalogVersion` | `JOIN {Catalog AS c} ON ... WHERE {c:id}='...' AND {cv:version}='Online'` |
| `StockLevel` | `WHERE {productCode}='...'` |
| `PriceRow` | `JOIN {Product AS p} ON {pr:product}={p:pk} WHERE {p:code}='...'` |

→ Full type reference: [`references/sap-cc-types.md`](references/sap-cc-types.md)

---

## Development Guidelines

### What to modify and where

| Goal | File(s) to change |
|---|---|
| Add a new CLI flag (HAC) | `scripts/execute.js` — `getArg()`/`hasFlag()` + pass to client |
| Add a new resource/action (Cloud Portal) | `scripts/portal.js` — extend the `dispatch()` switch + `references/portal-guide.md` |
| Change routing logic (FlexSearch vs Groovy vs Portal) | `references/decision-guide.md` + `references/portal-guide.md` + `SKILL.md` description |
| Add FlexSearch examples | `references/flexsearch-guide.md` |
| Add Groovy patterns / Spring beans | `references/groovy-patterns.md` |
| Add a new SAP CC type | `references/sap-cc-types.md` |
| Add Cloud Portal command examples/workflows | `references/portal-guide.md` |
| Change the skill name/description shown to agents | `SKILL.md` front matter |
| Bump version | `package.json` + `SKILL.md` metadata |

### What NOT to do

- ❌ Do not add a build step or TypeScript — keep it plain Node.js CommonJS
- ❌ Do not add a test runner requiring a live SAP CC instance in CI — use `--health-check` manually
- ❌ Do not call `npm install` from code other than `ensureDeps()` in `execute.js` / `portal.js`
- ❌ Do not log credentials to stdout/stderr (even partially)
- ❌ Do not change `HAC_URL` / `HAC_USERNAME` / `HAC_PASSWORD` env var names — they are defined by `sapcc-hac-client`
- ❌ Do not change `PORTAL_*` env var names — they are defined by `sapcc-portal-cli`
- ❌ Do not commit `.env` — the `.gitignore` covers it; double-check before any commit
- ❌ Do not run destructive Portal actions (deletes, production deployments, `REJECT` decisions) without explicit user confirmation

### Commit convention

[Conventional Commits](https://www.conventionalcommits.org/): `<type>(<scope>): <description>`

Types: `feat`, `fix`, `docs`, `refactor`, `chore`, `perf`

Examples:
```
feat(groovy): add --timeout flag support
fix(flexsearch): handle NULL values in JOIN
docs: add Cloud Portal API integration section
chore: bump sapcc-hac-client to 1.2.0
feat(portal): add sccp roles assign wrapper command
```

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `Missing required environment variables` (HAC) | `.env` not found or incomplete | Run `node scripts/setup.js` to diagnose |
| `Missing required environment variables: PORTAL_...` | `.env` missing Portal vars | Fill `PORTAL_SUBSCRIPTION_CODE`, `PORTAL_TOKEN_ENDPOINT`, `PORTAL_CLIENT_ID`, `PORTAL_CLIENT_SECRET`, `PORTAL_RESOURCE` |
| `Authentication failed` (HAC) | Wrong credentials or HAC URL | Verify `HAC_URL` (no trailing slash), check credentials |
| `OAuth2 token request failed` (Portal) | Wrong client id/secret/endpoint/resource | Verify `PORTAL_TOKEN_ENDPOINT` and OAuth2 credentials with the Cloud Portal admin |
| `HTTP 403` | HAC user lacks scripting permissions / Portal client lacks subscription rights | Grant HAC scripting console role, or check Portal client permissions |
| `ECONNREFUSED` / `ETIMEDOUT` | Network issue or wrong URL | Check URL, try `HAC_IGNORE_SSL=true` for dev (HAC only) |
| `sapcc-hac-client not found` | Auto-install failed | Run `npm install` manually in skill dir |
| `sapcc-portal-cli not found` | Auto-install failed | Run `npm install` manually in skill dir |
| FlexSearch returns 0 rows | Wrong type name / missing filter | Check `{versionID} IS NULL` for orders; verify catalog filter |
| Groovy `MissingMethodException` | Wrong Spring bean name | See `references/groovy-patterns.md` bean name table |
| Groovy changes not persisted | Missing `--commit` | Add `--commit` flag for write operations |
| `Unknown command "<resource> <action>"` (Portal) | Typo or unsupported action | Check `references/portal-guide.md` command reference |

---

## Versioning

| Version | Notes |
|---|---|
| `2.1.0` | Added Cloud Portal support via `sapcc-portal-cli` (`scripts/portal.js`, `references/portal-guide.md`) |
| `2.0.0` | Renamed from `sapcc-hac-skill` to `sapcc-skill` — generic, extensible name |
| `1.0.0` | Initial release — Groovy + FlexSearch via HAC |

---

## Links

- npm package (HAC transport layer): [`sapcc-hac-client`](https://www.npmjs.com/package/sapcc-hac-client)
- npm package (Cloud Portal transport layer): [`sapcc-portal-cli`](https://www.npmjs.com/package/sapcc-portal-cli)
- Agent Skills standard: [agentskills.io](https://agentskills.io)
- agents.md standard: [agents.md](https://agents.md)
- Repository: [github.com/eljoujat/sapcc-skill](https://github.com/eljoujat/sapcc-skill)

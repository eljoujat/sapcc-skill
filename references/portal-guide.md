# Cloud Portal Guide (scripts/portal.js)

`scripts/portal.js` wraps [`sapcc-portal-cli`](https://www.npmjs.com/package/sapcc-portal-cli) to operate the
**CCv2 Cloud Portal API** — everything a DevOps engineer does in the Cloud Portal UI: builds, deployments,
environments, backups, scaling, endpoints, certificates, scheduled activities, service properties and user roles.

This is a **separate concern** from `scripts/execute.js` (HAC / Groovy / FlexibleSearch):

| Script | Targets | Use for |
|---|---|---|
| `scripts/execute.js` | HAC (Hybris Administration Console) | Data queries, business logic, ImpEx, cronjobs, in-app writes |
| `scripts/portal.js` | Cloud Portal REST API | Builds, deployments, environment lifecycle, scaling, backups, certs, roles |

---

## When to use portal.js

Use it whenever the user asks about:
- Listing/inspecting **environments** and their deployment status
- Creating/tracking a **build** from a Git branch
- Launching/tracking a **deployment** (ROLLING_UPDATE, RECREATE, GREEN/canary) and accepting/rejecting canaries
- Managing **data backups** and restores
- Reading or updating **scaling** (replicas, CPU, memory) of a service
- Managing **endpoints** (public/private domains routing to k8s services)
- Managing **SSL certificates**
- Scheduling/cancelling **maintenance windows** or other scheduled activities
- Reading/writing **service configuration properties**
- Listing/assigning/removing **user roles** on environments

If the request is about querying/mutating **application data** (products, orders, customers) or running
business logic, use `scripts/execute.js` instead (see [decision-guide.md](decision-guide.md)).

---

## Setup

Requires additional `.env` variables (see `.env.example`):

```
PORTAL_API_URL=https://portalapi.commerce.ondemand.com/v2
PORTAL_SUBSCRIPTION_CODE=your_subscription_code
PORTAL_TOKEN_ENDPOINT=https://ycloud.accounts.ondemand.com/oauth2/token
PORTAL_CLIENT_ID=your_client_id
PORTAL_CLIENT_SECRET=your_client_secret
PORTAL_RESOURCE=your_resource_urn
```

Verify setup:

```bash
node <skill-dir>/scripts/portal.js --health-check
```

Dependencies (`sapcc-portal-cli`) are auto-installed on first run, same mechanism as `execute.js`.

---

## Command reference

General shape: `node scripts/portal.js <resource> <action> [positional args...] [--flags]`

Output is always JSON: `{ "success": true, "data": {...} }` or `{ "success": false, "error": "...", "detail": "..." }`.

### Environments

```bash
node scripts/portal.js environments list [--status <s>] [--deployment-status <s>]
```

### Builds

```bash
node scripts/portal.js builds list [--top <n>] [--skip <n>] [--order-by <field>]
node scripts/portal.js builds get <buildCode>
node scripts/portal.js builds progress <buildCode>
node scripts/portal.js builds create --branch <branch> --name <name> [--application-code <code>]
node scripts/portal.js builds delete <buildCode>
```

### Deployments

```bash
node scripts/portal.js deployments list [--build-code <c>] [--environment-code <c>] [--status <s>]
node scripts/portal.js deployments get <deploymentCode>
node scripts/portal.js deployments progress <deploymentCode>
node scripts/portal.js deployments create --build-code <c> --environment-code <c> \
  --db-mode <NONE|UPDATE|INITIALIZE> --strategy <ROLLING_UPDATE|RECREATE|GREEN>
node scripts/portal.js deployments decision <deploymentCode> --decision <ACCEPT|REJECT|PREPARE_CANARY> [--reason <r>]
node scripts/portal.js deployments modes
```

### Endpoints

```bash
node scripts/portal.js endpoints list <environmentCode> [--service <s>] [--web-proxy <public|private|nat>]
node scripts/portal.js endpoints get <environmentCode> <endpointCode>
node scripts/portal.js endpoints create <environmentCode> --name <n> --domain <d> \
  --protocol <HTTP|HTTPS> --access <ALLOW_ALL|DENY_ALL> --k8s-service <s> [--k8s-version <GREEN|BLUE|UNSPECIFIED>]
node scripts/portal.js endpoints delete <environmentCode> <endpointCode>
```

### Backups & restores

```bash
node scripts/portal.js backups list <environmentCode>
node scripts/portal.js backups get <environmentCode> <databackupCode>
node scripts/portal.js backups create <environmentCode> [--description <d>] [--type <QUICK|STANDARD>] [--no-database] [--no-storage]
node scripts/portal.js backups delete <environmentCode> <databackupCode>
node scripts/portal.js backups restore <environmentCode> <databackupCode> [--source-environment <c>]
```

### Scaling

```bash
node scripts/portal.js scaling get <environmentCode>
node scripts/portal.js scaling options <environmentCode>
node scripts/portal.js scaling update <environmentCode> --service <s> \
  [--replicas <n>] [--cpu <c>] [--memory <m>] [--memory-scale-factor <f>]
```

### Certificates

```bash
node scripts/portal.js certificates list
node scripts/portal.js certificates get <certificateCode>
node scripts/portal.js certificates create --name <n> --cert-file <path> --key-file <path> [--ca-file <path>] [--description <d>]
node scripts/portal.js certificates delete <certificateCode>
```

### Scheduled activities

```bash
node scripts/portal.js activities list <environmentCode> [--type <t>] [--status <s>]
node scripts/portal.js activities get <environmentCode> <activityCode>
node scripts/portal.js activities create <environmentCode> --type <t> --at <ISO-8601 timestamp>
node scripts/portal.js activities cancel <environmentCode> <activityCode>
```

### Service properties

```bash
node scripts/portal.js properties get <environmentCode> <serviceCode> <propertyCode>
node scripts/portal.js properties set <environmentCode> <serviceCode> <propertyCode> --key <k> --value <v>
```

### Roles

```bash
node scripts/portal.js roles list
node scripts/portal.js roles list-users
node scripts/portal.js roles assign --username <u> --email <e> --role <r> --environments <e1,e2,...>
node scripts/portal.js roles unassign --username <u> --role <r>
```

---

## Typical workflows

### Deploy a new build

```bash
node scripts/portal.js builds create --branch develop --name release-2.5.0
node scripts/portal.js builds progress <buildCode>
node scripts/portal.js backups create staging --description "Before release-2.5.0" --type STANDARD
node scripts/portal.js deployments create --build-code <buildCode> --environment-code staging \
  --db-mode UPDATE --strategy ROLLING_UPDATE
node scripts/portal.js deployments progress <deploymentCode>
```

### Canary (GREEN) deployment to production

```bash
node scripts/portal.js deployments create --build-code <buildCode> --environment-code prod \
  --db-mode UPDATE --strategy GREEN
# Validate on the green slot, then:
node scripts/portal.js deployments decision <deploymentCode> --decision ACCEPT --reason "Validated on staging"
# or reject:
node scripts/portal.js deployments decision <deploymentCode> --decision REJECT --reason "Regression found"
```

### Scale a service

```bash
node scripts/portal.js scaling get prod
node scripts/portal.js scaling options prod
node scripts/portal.js scaling update prod --service storefront --replicas 4 --memory-scale-factor 1.5
```

### Grant environment access

```bash
node scripts/portal.js roles list
node scripts/portal.js roles assign --username jdoe --email jdoe@example.com --role ADMIN --environments staging,prod
```

---

## Error handling

| Error | Action |
|---|---|
| `Missing required environment variables: PORTAL_...` | Ask user to fill `.env` (see Setup above) |
| `OAuth2 token request failed` | Check `PORTAL_TOKEN_ENDPOINT`, `PORTAL_CLIENT_ID`, `PORTAL_CLIENT_SECRET`, `PORTAL_RESOURCE` |
| `HTTP 401` after retry | Credentials invalid or expired — verify with the Cloud Portal admin |
| `HTTP 403` | Client lacks permission for this subscription/environment |
| `HTTP 404` on get/progress | Wrong code (buildCode/deploymentCode/environmentCode) — list first to confirm |
| `Missing positional argument(s)` / `Missing --flag` | Check the command reference above and re-run with required args |

---

## Notes for the agent

- Always confirm **destructive** actions before running them: `backups delete`, `certificates delete`,
  `endpoints delete`, `deployments decision --decision REJECT`, `roles unassign`, production deployments.
- Prefer creating a **backup** before a deployment on production-like environments when the user doesn't
  explicitly forbid it — mention it as a suggestion if skipped.
- `deployments create --strategy GREEN` requires an explicit follow-up `deployments decision` — tell the
  user this is a two-step process.
- Present list results (`builds list`, `deployments list`, `environments list`, etc.) as Markdown tables
  when the payload contains an array (`value` or similar) of objects.

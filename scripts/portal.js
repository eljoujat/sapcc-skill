#!/usr/bin/env node
'use strict';

/**
 * sapcc-skill – portal.js
 *
 * CLI entry point for the SAP Commerce Cloud Cloud Portal API (CCv2 DevOps
 * operations: environments, builds, deployments, backups, scaling,
 * endpoints, certificates, scheduled activities, properties, roles).
 *
 * Delegates to sapcc-portal-cli (https://www.npmjs.com/package/sapcc-portal-cli).
 * Always prints JSON on stdout, mirroring execute.js conventions so the
 * agent can parse both scripts identically.
 *
 * Usage (resource + action + positional args + flags):
 *   node portal.js environments list [--status <s>] [--deployment-status <s>]
 *
 *   node portal.js builds list [--top <n>] [--skip <n>] [--order-by <field>]
 *   node portal.js builds get <buildCode>
 *   node portal.js builds progress <buildCode>
 *   node portal.js builds create --branch <branch> --name <name> [--application-code <code>]
 *   node portal.js builds delete <buildCode>
 *
 *   node portal.js deployments list [--build-code <c>] [--environment-code <c>] [--status <s>]
 *   node portal.js deployments get <deploymentCode>
 *   node portal.js deployments progress <deploymentCode>
 *   node portal.js deployments create --build-code <c> --environment-code <c> --db-mode <NONE|UPDATE|INITIALIZE> --strategy <ROLLING_UPDATE|RECREATE|GREEN>
 *   node portal.js deployments decision <deploymentCode> --decision <ACCEPT|REJECT|PREPARE_CANARY> [--reason <r>]
 *   node portal.js deployments modes
 *
 *   node portal.js endpoints list <environmentCode> [--service <s>] [--web-proxy <public|private|nat>]
 *   node portal.js endpoints get <environmentCode> <endpointCode>
 *   node portal.js endpoints create <environmentCode> --name <n> --domain <d> --protocol <HTTP|HTTPS> --access <ALLOW_ALL|DENY_ALL> --k8s-service <s> [--k8s-version <GREEN|BLUE|UNSPECIFIED>]
 *   node portal.js endpoints delete <environmentCode> <endpointCode>
 *
 *   node portal.js backups list <environmentCode>
 *   node portal.js backups get <environmentCode> <databackupCode>
 *   node portal.js backups create <environmentCode> [--description <d>] [--type <QUICK|STANDARD>] [--no-database] [--no-storage]
 *   node portal.js backups delete <environmentCode> <databackupCode>
 *   node portal.js backups restore <environmentCode> <databackupCode> [--source-environment <c>]
 *
 *   node portal.js scaling get <environmentCode>
 *   node portal.js scaling options <environmentCode>
 *   node portal.js scaling update <environmentCode> --service <s> [--replicas <n>] [--cpu <c>] [--memory <m>] [--memory-scale-factor <f>]
 *
 *   node portal.js certificates list
 *   node portal.js certificates get <certificateCode>
 *   node portal.js certificates create --name <n> --cert-file <path> --key-file <path> [--ca-file <path>] [--description <d>]
 *   node portal.js certificates delete <certificateCode>
 *
 *   node portal.js activities list <environmentCode> [--type <t>] [--status <s>]
 *   node portal.js activities get <environmentCode> <activityCode>
 *   node portal.js activities create <environmentCode> --type <t> --at <ISO-8601 timestamp>
 *   node portal.js activities cancel <environmentCode> <activityCode>
 *
 *   node portal.js properties get <environmentCode> <serviceCode> <propertyCode>
 *   node portal.js properties set <environmentCode> <serviceCode> <propertyCode> --key <k> --value <v>
 *
 *   node portal.js roles list
 *   node portal.js roles list-users
 *   node portal.js roles assign --username <u> --email <e> --role <r> --environments <e1,e2,...>
 *   node portal.js roles unassign --username <u> --role <r>
 *
 *   node portal.js --health-check
 *
 * Global options:
 *   --env-file PATH  Explicit path to .env file
 *   --json           No-op (output is always JSON) – kept for CLI symmetry with execute.js
 */

const path = require('path');
const fs = require('fs');

// ─── Auto-install dependencies on first use ────────────────────────────────

(function ensureDeps() {
  const skillDir = path.join(__dirname, '..');
  const nmDir = path.join(skillDir, 'node_modules');
  const stampFile = path.join(nmDir, '.sapcc-portal-installed');

  if (fs.existsSync(stampFile)) return;
  if (fs.existsSync(path.join(nmDir, 'sapcc-portal-cli'))) {
    try { fs.writeFileSync(stampFile, new Date().toISOString()); } catch (_) {}
    return;
  }

  process.stderr.write('[sapcc-skill] First run – installing dependencies...\n');
  try {
    const { execSync } = require('child_process');
    execSync('npm install --prefer-offline --no-audit --no-fund --loglevel=error', {
      cwd: skillDir,
      stdio: ['ignore', 'ignore', 'pipe'],
      timeout: 90_000,
    });
    try { fs.writeFileSync(stampFile, new Date().toISOString()); } catch (_) {}
    process.stderr.write('[sapcc-skill] Dependencies installed.\n');
  } catch (e) {
    process.stderr.write(`[sapcc-skill] npm install failed: ${e.message}\n`);
  }
}());

// ─── Argument parsing (no extra deps) ──────────────────────────────────────

const BOOLEAN_FLAGS = new Set(['no-database', 'no-storage', 'json', 'health-check']);

function parseArgs(argv) {
  const positionals = [];
  const flags = {};

  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i];
    if (tok.startsWith('--')) {
      const name = tok.slice(2);
      if (BOOLEAN_FLAGS.has(name)) {
        flags[name] = true;
      } else {
        const next = argv[i + 1];
        if (next === undefined || next.startsWith('--')) {
          flags[name] = true;
        } else {
          flags[name] = next;
          i++;
        }
      }
    } else {
      positionals.push(tok);
    }
  }

  return { positionals, flags };
}

const { positionals, flags } = parseArgs(process.argv.slice(2));
const [resource, action, ...rest] = positionals;
const envFilePath = flags['env-file'];
const healthCheck = flags['health-check'] || (resource === undefined && action === undefined && positionals.length === 0 && flags['health-check']);

// ─── Load sapcc-portal-cli (local or global) ───────────────────────────────

let createClient;
try {
  const clientPath = require.resolve('sapcc-portal-cli', {
    paths: [__dirname, path.join(__dirname, '..'), process.cwd()],
  });
  ({ createClient } = require(clientPath));
} catch (e) {
  console.log(JSON.stringify({
    success: false,
    error: 'sapcc-portal-cli not found after auto-install attempt.',
    hint: `Run manually: cd ${path.join(__dirname, '..')} && npm install`,
  }, null, 2));
  process.exit(1);
}

// ─── Output helpers ─────────────────────────────────────────────────────────

function output(data) {
  console.log(JSON.stringify({ success: true, ...(data !== undefined ? { data } : {}) }, null, 2));
}

function outputError(msg, detail = null) {
  console.log(JSON.stringify({ success: false, error: msg, ...(detail ? { detail } : {}) }, null, 2));
  process.exit(1);
}

function toInt(v) { return v === undefined ? undefined : parseInt(v, 10); }
function toFloat(v) { return v === undefined ? undefined : parseFloat(v); }

// ─── Command routing ────────────────────────────────────────────────────────

async function dispatch(client) {
  const need = (n, label) => {
    if (rest.length < n) outputError(`Missing positional argument(s): ${label}`);
  };

  switch (`${resource} ${action}`) {
    // environments
    case 'environments list':
    case 'env list':
      return client.listEnvironments({ status: flags.status, deploymentStatus: flags['deployment-status'] });

    // builds
    case 'builds list':
      return client.listBuilds({ top: toInt(flags.top), skip: toInt(flags.skip), orderBy: flags['order-by'] });
    case 'builds get':
      need(1, 'buildCode');
      return client.getBuild(rest[0]);
    case 'builds progress':
      need(1, 'buildCode');
      return client.getBuildProgress(rest[0]);
    case 'builds create':
      if (!flags.branch || !flags.name) outputError('Missing --branch or --name for builds create');
      return client.createBuild({ branch: flags.branch, name: flags.name, applicationCode: flags['application-code'] });
    case 'builds delete':
      need(1, 'buildCode');
      return client.deleteBuild(rest[0]);

    // deployments
    case 'deployments list':
    case 'deploy list':
      return client.listDeployments({ buildCode: flags['build-code'], environmentCode: flags['environment-code'], status: flags.status });
    case 'deployments get':
    case 'deploy get':
      need(1, 'deploymentCode');
      return client.getDeployment(rest[0]);
    case 'deployments progress':
    case 'deploy progress':
      need(1, 'deploymentCode');
      return client.getDeploymentProgress(rest[0]);
    case 'deployments create':
    case 'deploy create':
      if (!flags['build-code'] || !flags['environment-code'] || !flags['db-mode'] || !flags.strategy) {
        outputError('Missing --build-code, --environment-code, --db-mode or --strategy for deployments create');
      }
      return client.createDeployment({
        buildCode: flags['build-code'],
        environmentCode: flags['environment-code'],
        databaseUpdateMode: flags['db-mode'],
        strategy: flags.strategy,
      });
    case 'deployments decision':
    case 'deploy decision':
      need(1, 'deploymentCode');
      if (!flags.decision) outputError('Missing --decision for deployments decision');
      return client.createDeploymentDecision(rest[0], { decision: flags.decision, reason: flags.reason });
    case 'deployments modes':
    case 'deploy modes':
      return client.getDeploymentModes();

    // endpoints
    case 'endpoints list':
      need(1, 'environmentCode');
      return client.listEndpoints(rest[0], { service: flags.service, webProxy: flags['web-proxy'] });
    case 'endpoints get':
      need(2, 'environmentCode endpointCode');
      return client.getEndpoint(rest[0], rest[1]);
    case 'endpoints create':
      need(1, 'environmentCode');
      if (!flags.name || !flags.domain || !flags.protocol || !flags.access || !flags['k8s-service']) {
        outputError('Missing --name, --domain, --protocol, --access or --k8s-service for endpoints create');
      }
      return client.createEndpoint(rest[0], {
        name: flags.name,
        domainName: flags.domain,
        protocol: flags.protocol,
        access: flags.access,
        k8sService: flags['k8s-service'],
        k8sServiceVersion: flags['k8s-version'] || 'UNSPECIFIED',
      });
    case 'endpoints delete':
      need(2, 'environmentCode endpointCode');
      return client.deleteEndpoint(rest[0], rest[1]);

    // backups
    case 'backups list':
      need(1, 'environmentCode');
      return client.listDatabackups(rest[0]);
    case 'backups get':
      need(2, 'environmentCode databackupCode');
      return client.getDatabackup(rest[0], rest[1]);
    case 'backups create':
      need(1, 'environmentCode');
      return client.createDatabackup(rest[0], {
        description: flags.description,
        databackupType: flags.type || 'STANDARD',
        includeDatabase: flags['no-database'] ? false : true,
        includeStorage: flags['no-storage'] ? false : true,
      });
    case 'backups delete':
      need(2, 'environmentCode databackupCode');
      return client.deleteDatabackup(rest[0], rest[1]);
    case 'backups restore':
      need(2, 'environmentCode databackupCode');
      return client.createDatarestore(rest[0], { databackupCode: rest[1], sourceEnvironmentCode: flags['source-environment'] });

    // scaling
    case 'scaling get':
      need(1, 'environmentCode');
      return client.getScaling(rest[0]);
    case 'scaling options':
      need(1, 'environmentCode');
      return client.getScalingOptions(rest[0]);
    case 'scaling update':
      need(1, 'environmentCode');
      if (!flags.service) outputError('Missing --service for scaling update');
      return client.updateScaling(rest[0], {
        serviceCode: flags.service,
        replicas: toInt(flags.replicas),
        requestsCpu: flags.cpu,
        requestsMemory: flags.memory,
        memoryScaleFactor: toFloat(flags['memory-scale-factor']),
      });

    // certificates
    case 'certificates list':
    case 'certs list':
      return client.listCertificates();
    case 'certificates get':
    case 'certs get':
      need(1, 'certificateCode');
      return client.getCertificate(rest[0]);
    case 'certificates create':
    case 'certs create': {
      if (!flags.name || !flags['cert-file'] || !flags['key-file']) {
        outputError('Missing --name, --cert-file or --key-file for certificates create');
      }
      const certificate = fs.readFileSync(path.resolve(flags['cert-file']), 'utf8');
      const certificateKey = fs.readFileSync(path.resolve(flags['key-file']), 'utf8');
      const caCertificate = flags['ca-file'] ? fs.readFileSync(path.resolve(flags['ca-file']), 'utf8') : undefined;
      return client.createCertificate({ name: flags.name, certificate, certificateKey, caCertificate, description: flags.description });
    }
    case 'certificates delete':
    case 'certs delete':
      need(1, 'certificateCode');
      return client.deleteCertificate(rest[0]);

    // scheduled activities
    case 'activities list':
      need(1, 'environmentCode');
      return client.listScheduledActivities(rest[0], { activityType: flags.type, status: flags.status });
    case 'activities get':
      need(2, 'environmentCode activityCode');
      return client.getScheduledActivity(rest[0], rest[1]);
    case 'activities create':
      need(1, 'environmentCode');
      if (!flags.type || !flags.at) outputError('Missing --type or --at for activities create');
      return client.createScheduledActivity(rest[0], { activityType: flags.type, scheduledTimestamp: flags.at });
    case 'activities cancel':
      need(2, 'environmentCode activityCode');
      return client.cancelScheduledActivity(rest[0], rest[1]);

    // properties
    case 'properties get':
    case 'props get':
      need(3, 'environmentCode serviceCode propertyCode');
      return client.getProperty(rest[0], rest[1], rest[2]);
    case 'properties set':
    case 'props set':
      need(3, 'environmentCode serviceCode propertyCode');
      if (!flags.key || flags.value === undefined) outputError('Missing --key or --value for properties set');
      return client.putProperty(rest[0], rest[1], rest[2], { key: flags.key, value: flags.value });

    // roles
    case 'roles list':
      return client.listRoles();
    case 'roles list-users':
      return client.listUserRoles();
    case 'roles assign':
      if (!flags.username || !flags.email || !flags.role || !flags.environments) {
        outputError('Missing --username, --email, --role or --environments for roles assign');
      }
      return client.assignUserRole({
        username: flags.username,
        email: flags.email,
        role: flags.role,
        environments: String(flags.environments).split(',').map((e) => e.trim()),
      });
    case 'roles unassign':
      if (!flags.username || !flags.role) outputError('Missing --username or --role for roles unassign');
      return client.deleteUserRole({ username: flags.username, role: flags.role });

    default:
      outputError(
        `Unknown command "${[resource, action].filter(Boolean).join(' ')}".`,
        'Run without arguments to see usage, or check references/portal-guide.md.'
      );
  }
}

// ─── Main ────────────────────────────────────────────────────────────────

async function main() {
  // Resolve .env: explicit arg → cwd/.env → skill/.env → env vars
  const envPaths = [
    envFilePath,
    path.join(process.cwd(), '.env'),
    path.join(__dirname, '..', '.env'),
    path.join(__dirname, '.env'),
  ].filter(Boolean);

  let envLoaded = false;
  const dotenv = require('dotenv');
  for (const p of envPaths) {
    if (fs.existsSync(p)) {
      dotenv.config({ path: p });
      envLoaded = true;
      if (process.env.PORTAL_DEBUG === 'true') {
        process.stderr.write(`[sapcc-skill] Loaded .env from: ${p}\n`);
      }
      break;
    }
  }

  let client;
  try {
    client = createClient({ envPath: envFilePath });
  } catch (e) {
    outputError(e.message, 'Set PORTAL_API_URL, PORTAL_SUBSCRIPTION_CODE, PORTAL_TOKEN_ENDPOINT, PORTAL_CLIENT_ID, PORTAL_CLIENT_SECRET and PORTAL_RESOURCE in your .env file.');
    return;
  }

  if (flags['health-check']) {
    try {
      await client.listEnvironments({});
      output({ message: 'Authentication successful', apiUrl: process.env.PORTAL_API_URL, subscriptionCode: process.env.PORTAL_SUBSCRIPTION_CODE, envLoaded });
    } catch (e) {
      outputError(`Health check failed: ${e.message}`);
    }
    return;
  }

  if (!resource || !action) {
    outputError('Missing resource/action. Usage: node portal.js <resource> <action> [args] [--flags]. See references/portal-guide.md.');
    return;
  }

  let result;
  try {
    result = await dispatch(client);
  } catch (e) {
    outputError(`Portal API error: ${e.message}`);
    return;
  }

  output(result);
}

main().catch((err) => {
  outputError(`Unexpected error: ${err.message}`, err.stack);
});

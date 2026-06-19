#!/usr/bin/env node
'use strict';

/**
 * Generate a Hermes config scaffold from ECC conventions.
 *
 * Follows the workspace map in docs/HERMES-SETUP.md: a `config.yaml` that wires
 * model routing, the `ecc-imports` skills path, plugin loading, and MCP server
 * registration. The MCP block is translated from ECC's mcp-configs/mcp-servers.json.
 *
 * Output is written to `<hermes-home>/config.ecc.yaml` (an example to merge into
 * your real `~/.hermes/config.yaml`) so we never clobber an existing config or
 * guess a Hermes schema version on top of the user's settings. Secrets are left
 * as placeholders and never written from the environment.
 */

const fs = require('fs');
const path = require('path');
const { getHomeDir, ensureDir } = require('./lib/utils');
const { filterMcpConfig } = require('./lib/mcp-config');

const REPO_ROOT = path.resolve(__dirname, '..');
const MCP_SOURCE = path.join(REPO_ROOT, 'mcp-configs', 'mcp-servers.json');
const OUTPUT_REL = 'config.ecc.yaml';
const SKILLS_REL = path.join('skills', 'ecc-imports');

function getHelpText() {
  return `
Usage: node scripts/hermes-config-init.js [options]

Write a Hermes config scaffold (config.ecc.yaml) plus the ecc-imports skills dir.

Options:
  --hermes-home <dir>   Hermes home (default: ~/.hermes)
  --dry-run             Print the scaffold without writing
  --json                Emit machine-readable JSON (path + server names)
  --help                Show this help text
`;
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const parsed = { hermesHome: null, dryRun: false, json: false, help: false };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--hermes-home') {
      parsed.hermesHome = args[index + 1] || null;
      index += 1;
    } else if (arg === '--dry-run') {
      parsed.dryRun = true;
    } else if (arg === '--json') {
      parsed.json = true;
    } else if (arg === '--help' || arg === '-h') {
      parsed.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return parsed;
}

// Minimal YAML emitter for plain data (strings, numbers, booleans, null,
// arrays of scalars, and nested objects) — covers the mcp-servers.json shape.
function toYaml(value, indent) {
  const pad = '  '.repeat(indent);
  if (value === null || value === undefined) {
    return 'null';
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return '[]';
    }
    return `\n${value
      .map((item) => (item !== null && typeof item === 'object'
        ? `${pad}- ${JSON.stringify(item)}`
        : `${pad}- ${toYaml(item, indent)}`))
      .join('\n')}`;
  }
  const keys = Object.keys(value);
  if (keys.length === 0) {
    return '{}';
  }
  return `\n${keys
    .map((key) => {
      const serialized = toYaml(value[key], indent + 1);
      return serialized.startsWith('\n')
        ? `${pad}${key}:${serialized}`
        : `${pad}${key}: ${serialized}`;
    })
    .join('\n')}`;
}

function loadMcpServers() {
  if (!fs.existsSync(MCP_SOURCE)) {
    return { servers: {}, names: [] };
  }
  const raw = JSON.parse(fs.readFileSync(MCP_SOURCE, 'utf8'));
  const { config } = filterMcpConfig(raw, process.env.ECC_DISABLED_MCPS || '');
  const servers = config.mcpServers || {};
  return { servers, names: Object.keys(servers).sort() };
}

function buildScaffold(servers) {
  const mcpYaml = Object.keys(servers).length > 0
    ? toYaml(servers, 1)
    : ' {}';
  return `# ECC-generated Hermes config scaffold.
# Merge the parts you need into ~/.hermes/config.yaml.
# Adjust keys to match your installed Hermes version's schema.
# Secrets stay as placeholders — never commit real keys.

# Model routing: pick your provider and supply the key via env/secret store.
model:
  provider: "openrouter"   # or: nous-portal | openai | custom
  # api_key: set HERMES_MODEL_API_KEY in your environment; do not hardcode.

# Skills: ECC skills are synced here by scripts/hermes-sync.js
skills:
  paths:
    - "${SKILLS_REL.replace(/\\/g, '/')}"

# Plugins: bridge plugins for hooks/reminders/tool glue.
plugins:
  paths:
    - "plugins"

# MCP servers: translated from ECC mcp-configs/mcp-servers.json.
# Replace YOUR_*_HERE placeholders with real values via env/secret store.
mcp_servers:${mcpYaml}
`;
}

function run(options = {}) {
  const home = getHomeDir();
  const hermesHome = path.resolve(options.hermesHome || path.join(home, '.hermes'));
  const outputPath = path.join(hermesHome, OUTPUT_REL);
  const skillsDir = path.join(hermesHome, SKILLS_REL);

  const { servers, names } = loadMcpServers();
  const scaffold = buildScaffold(servers);

  if (!options.dryRun) {
    ensureDir(skillsDir);
    fs.writeFileSync(outputPath, scaffold, 'utf8');
  }

  return {
    dryRun: Boolean(options.dryRun),
    hermesHome,
    outputPath,
    skillsDir,
    mcpServerCount: names.length,
    mcpServers: names,
    scaffold,
  };
}

function main() {
  try {
    const options = parseArgs(process.argv);
    if (options.help) {
      console.log(getHelpText());
      process.exit(0);
    }

    const result = run(options);
    if (options.json) {
      const { scaffold: _scaffold, ...summary } = result;
      console.log(JSON.stringify(summary, null, 2));
    } else if (options.dryRun) {
      console.log(`Hermes config scaffold (dry run) for ${result.hermesHome}:\n`);
      console.log(result.scaffold);
    } else {
      console.log('Hermes config scaffold written.\n');
      console.log(`Hermes home: ${result.hermesHome}`);
      console.log(`Scaffold:    ${result.outputPath}`);
      console.log(`Skills dir:  ${result.skillsDir}`);
      console.log(`MCP servers: ${result.mcpServerCount} (${result.mcpServers.join(', ') || 'none'})`);
      console.log('\nMerge config.ecc.yaml into ~/.hermes/config.yaml and add your provider key.');
    }
  } catch (error) {
    process.stderr.write(`Error: ${error.message}\n${getHelpText()}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  parseArgs,
  toYaml,
  loadMcpServers,
  buildScaffold,
  run,
};

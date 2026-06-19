#!/usr/bin/env node
'use strict';

/**
 * Sync ECC skills into a Hermes workspace.
 *
 * Implements the documented but previously-unautomated step from
 * docs/HERMES-SETUP.md and docs/architecture/cross-harness.md: copy ECC skills
 * into `~/.hermes/skills/ecc-imports/` so Hermes can load them natively.
 *
 * SKILL.md is the portable unit, so each skill directory is copied unchanged
 * (SKILL.md plus any references/scripts/templates it ships).
 */

const fs = require('fs');
const path = require('path');
const { getHomeDir, ensureDir } = require('./lib/utils');

// Default source is the ECC-managed skills namespace written by install-apply.js.
const DEFAULT_SOURCE_REL = path.join('.claude', 'skills', 'ecc');
const DEST_REL = path.join('skills', 'ecc-imports');

function getHelpText() {
  return `
Usage: node scripts/hermes-sync.js [options]

Copy ECC skills into a Hermes workspace at <hermes-home>/skills/ecc-imports/.

Options:
  --all                 Sync every skill in the source (default)
  --skills <a,b,c>      Sync only the named skill directories
  --source <dir>        Source skills dir (default: ~/.claude/skills/ecc)
  --hermes-home <dir>   Hermes home (default: ~/.hermes)
  --dry-run             Show the plan without copying
  --json                Emit machine-readable JSON
  --help                Show this help text
`;
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const parsed = {
    skills: [],
    source: null,
    hermesHome: null,
    dryRun: false,
    json: false,
    help: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--all') {
      // Default behaviour; accepted for explicitness.
    } else if (arg === '--skills') {
      const value = args[index + 1] || '';
      parsed.skills = value.split(',').map((entry) => entry.trim()).filter(Boolean);
      index += 1;
    } else if (arg === '--source') {
      parsed.source = args[index + 1] || null;
      index += 1;
    } else if (arg === '--hermes-home') {
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

function listSkillDirs(sourceDir) {
  return fs
    .readdirSync(sourceDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
}

function selectSkills(available, requested) {
  if (!requested || requested.length === 0) {
    return available;
  }

  const availableSet = new Set(available);
  const missing = requested.filter((name) => !availableSet.has(name));
  if (missing.length > 0) {
    throw new Error(`Skills not found in source: ${missing.join(', ')}`);
  }

  return requested.filter((name, index) => requested.indexOf(name) === index);
}

function copySkill(fromDir, toDir) {
  // Clean overwrite so removed files upstream do not linger in Hermes.
  fs.rmSync(toDir, { recursive: true, force: true });
  fs.cpSync(fromDir, toDir, { recursive: true });
}

function run(options = {}) {
  const home = getHomeDir();
  const source = path.resolve(options.source || path.join(home, DEFAULT_SOURCE_REL));
  if (!fs.existsSync(source) || !fs.statSync(source).isDirectory()) {
    throw new Error(`Source skills directory not found: ${source}\nInstall ECC first (./install.sh --profile full) or pass --source.`);
  }

  const hermesHome = path.resolve(options.hermesHome || path.join(home, '.hermes'));
  const destRoot = path.join(hermesHome, DEST_REL);

  const selected = selectSkills(listSkillDirs(source), options.skills);
  const operations = selected.map((name) => ({
    name,
    from: path.join(source, name),
    to: path.join(destRoot, name),
    hasSkillMd: fs.existsSync(path.join(source, name, 'SKILL.md')),
  }));

  if (!options.dryRun) {
    ensureDir(destRoot);
    for (const operation of operations) {
      copySkill(operation.from, operation.to);
    }
  }

  return {
    dryRun: Boolean(options.dryRun),
    source,
    hermesHome,
    destRoot,
    count: operations.length,
    missingSkillMd: operations.filter((operation) => !operation.hasSkillMd).map((operation) => operation.name),
    operations,
  };
}

function printHuman(result) {
  console.log(`${result.dryRun ? 'Hermes sync (dry run)' : 'Hermes sync'}:\n`);
  console.log(`Source:      ${result.source}`);
  console.log(`Hermes home: ${result.hermesHome}`);
  console.log(`Destination: ${result.destRoot}`);
  console.log(`Skills:      ${result.count}`);
  if (result.missingSkillMd.length > 0) {
    console.log(`\nWarning: ${result.missingSkillMd.length} dir(s) had no SKILL.md: ${result.missingSkillMd.join(', ')}`);
  }
  console.log(`\n${result.dryRun ? 'Would copy' : 'Copied'} ${result.count} skill(s) into ${result.destRoot}`);
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
      console.log(JSON.stringify(result, null, 2));
    } else {
      printHuman(result);
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
  listSkillDirs,
  selectSkills,
  run,
};

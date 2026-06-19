/**
 * Tests for scripts/hermes-config-init.js
 *
 * Run with: node tests/lib/hermes-config-init.test.js
 */

const assert = require('assert');
const os = require('os');
const path = require('path');
const fs = require('fs');

const configInit = require('../../scripts/hermes-config-init');

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    return true;
  } catch (err) {
    console.log(`  ✗ ${name}`);
    console.log(`    Error: ${err.message}`);
    return false;
  }
}

function makeHermesHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ecc-hermes-cfg-'));
}

function runTests() {
  console.log('\n=== Testing hermes-config-init.js ===\n');
  let passed = 0;
  let failed = 0;

  console.log('toYaml:');

  if (test('quotes strings and emits nested objects/arrays', () => {
    const yaml = configInit.toYaml({
      command: 'npx',
      args: ['-y', 'pkg'],
      env: { TOKEN: 'YOUR_TOKEN_HERE' },
    }, 0);
    assert.ok(yaml.includes('command: "npx"'));
    assert.ok(yaml.includes('- "-y"'));
    assert.ok(yaml.includes('TOKEN: "YOUR_TOKEN_HERE"'));
  })) passed++; else failed++;

  if (test('emits empty object as {}', () => {
    assert.strictEqual(configInit.toYaml({}, 0), '{}');
  })) passed++; else failed++;

  console.log('\nbuildScaffold:');

  if (test('includes ecc-imports skills path and mcp_servers block', () => {
    const scaffold = configInit.buildScaffold({ github: { type: 'http', url: 'https://x/mcp' } });
    assert.ok(scaffold.includes('skills/ecc-imports'));
    assert.ok(scaffold.includes('mcp_servers:'));
    assert.ok(scaffold.includes('github:'));
  })) passed++; else failed++;

  console.log('\nrun:');

  if (test('writes config.ecc.yaml and creates ecc-imports dir', () => {
    const hermesHome = makeHermesHome();
    const result = configInit.run({ hermesHome });
    assert.ok(fs.existsSync(result.outputPath));
    assert.ok(fs.existsSync(result.skillsDir));
    assert.strictEqual(path.basename(result.outputPath), 'config.ecc.yaml');
  })) passed++; else failed++;

  if (test('dry-run writes nothing', () => {
    const hermesHome = makeHermesHome();
    const result = configInit.run({ hermesHome, dryRun: true });
    assert.strictEqual(result.dryRun, true);
    assert.ok(!fs.existsSync(result.outputPath));
    assert.ok(!fs.existsSync(result.skillsDir));
  })) passed++; else failed++;

  if (test('reports the real ECC MCP catalog (non-empty)', () => {
    const hermesHome = makeHermesHome();
    const result = configInit.run({ hermesHome, dryRun: true });
    assert.ok(Array.isArray(result.mcpServers));
    assert.ok(result.mcpServerCount > 0, 'expected ECC mcp-servers.json to provide servers');
  })) passed++; else failed++;

  console.log('\n=== Test Results ===');
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total:  ${passed + failed}\n`);

  process.exit(failed > 0 ? 1 : 0);
}

runTests();

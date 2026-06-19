/**
 * Tests for scripts/hermes-sync.js
 *
 * Run with: node tests/lib/hermes-sync.test.js
 */

const assert = require('assert');
const os = require('os');
const path = require('path');
const fs = require('fs');

const hermesSync = require('../../scripts/hermes-sync');

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

function makeSource(skills) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ecc-src-'));
  for (const [name, withSkillMd] of Object.entries(skills)) {
    const dir = path.join(root, name);
    fs.mkdirSync(dir, { recursive: true });
    if (withSkillMd) {
      fs.writeFileSync(path.join(dir, 'SKILL.md'), `# ${name}\n`);
    }
  }
  return root;
}

function makeHermesHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ecc-hermes-'));
}

function runTests() {
  console.log('\n=== Testing hermes-sync.js ===\n');
  let passed = 0;
  let failed = 0;

  console.log('parseArgs:');

  if (test('parses --skills, --source, --hermes-home, --dry-run, --json', () => {
    const parsed = hermesSync.parseArgs([
      'node', 'hermes-sync.js',
      '--skills', 'a, b ,c',
      '--source', '/src',
      '--hermes-home', '/hh',
      '--dry-run', '--json',
    ]);
    assert.deepStrictEqual(parsed.skills, ['a', 'b', 'c']);
    assert.strictEqual(parsed.source, '/src');
    assert.strictEqual(parsed.hermesHome, '/hh');
    assert.strictEqual(parsed.dryRun, true);
    assert.strictEqual(parsed.json, true);
  })) passed++; else failed++;

  if (test('throws on unknown argument', () => {
    assert.throws(() => hermesSync.parseArgs(['node', 'x', '--nope']), /Unknown argument/);
  })) passed++; else failed++;

  console.log('\nselectSkills:');

  if (test('returns all when none requested', () => {
    assert.deepStrictEqual(hermesSync.selectSkills(['a', 'b'], []), ['a', 'b']);
  })) passed++; else failed++;

  if (test('returns requested subset', () => {
    assert.deepStrictEqual(hermesSync.selectSkills(['a', 'b', 'c'], ['c', 'a']), ['c', 'a']);
  })) passed++; else failed++;

  if (test('throws when a requested skill is missing', () => {
    assert.throws(() => hermesSync.selectSkills(['a'], ['a', 'z']), /Skills not found in source: z/);
  })) passed++; else failed++;

  console.log('\nrun:');

  if (test('copies all skills into <hermes-home>/skills/ecc-imports', () => {
    const source = makeSource({ alpha: true, beta: true });
    const hermesHome = makeHermesHome();
    const result = hermesSync.run({ source, hermesHome });
    assert.strictEqual(result.count, 2);
    const dest = path.join(hermesHome, 'skills', 'ecc-imports');
    assert.ok(fs.existsSync(path.join(dest, 'alpha', 'SKILL.md')));
    assert.ok(fs.existsSync(path.join(dest, 'beta', 'SKILL.md')));
  })) passed++; else failed++;

  if (test('dry-run does not write anything', () => {
    const source = makeSource({ alpha: true });
    const hermesHome = makeHermesHome();
    const result = hermesSync.run({ source, hermesHome, dryRun: true });
    assert.strictEqual(result.dryRun, true);
    assert.strictEqual(result.count, 1);
    assert.ok(!fs.existsSync(path.join(hermesHome, 'skills', 'ecc-imports')));
  })) passed++; else failed++;

  if (test('flags directories with no SKILL.md', () => {
    const source = makeSource({ good: true, bare: false });
    const hermesHome = makeHermesHome();
    const result = hermesSync.run({ source, hermesHome });
    assert.deepStrictEqual(result.missingSkillMd, ['bare']);
  })) passed++; else failed++;

  if (test('copies only the selected subset', () => {
    const source = makeSource({ a: true, b: true, c: true });
    const hermesHome = makeHermesHome();
    const result = hermesSync.run({ source, hermesHome, skills: ['b'] });
    assert.strictEqual(result.count, 1);
    const dest = path.join(hermesHome, 'skills', 'ecc-imports');
    assert.ok(fs.existsSync(path.join(dest, 'b')));
    assert.ok(!fs.existsSync(path.join(dest, 'a')));
  })) passed++; else failed++;

  if (test('overwrites cleanly (stale files removed)', () => {
    const source = makeSource({ a: true });
    const hermesHome = makeHermesHome();
    hermesSync.run({ source, hermesHome });
    const stale = path.join(hermesHome, 'skills', 'ecc-imports', 'a', 'stale.txt');
    fs.writeFileSync(stale, 'old');
    hermesSync.run({ source, hermesHome });
    assert.ok(!fs.existsSync(stale), 'stale file should be removed on re-sync');
  })) passed++; else failed++;

  if (test('throws when the source directory is missing', () => {
    assert.throws(
      () => hermesSync.run({ source: path.join(os.tmpdir(), 'does-not-exist-xyz'), hermesHome: makeHermesHome() }),
      /Source skills directory not found/,
    );
  })) passed++; else failed++;

  console.log('\n=== Test Results ===');
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total:  ${passed + failed}\n`);

  process.exit(failed > 0 ? 1 : 0);
}

runTests();

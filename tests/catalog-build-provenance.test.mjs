import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { assertBuildSource } from '../scripts/staging/build.mts';

async function repository(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'catalog-build-source-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'user.name=Build fixture',
    '-c', 'user.email=build-fixture@example.invalid', ...args], { cwd: root, encoding: 'utf8' }).trim();
  git('init', '--quiet');
  await writeFile(path.join(root, '.gitignore'), 'build/\n');
  await writeFile(path.join(root, 'source.txt'), 'reviewed source\n');
  git('add', '.gitignore', 'source.txt');
  git('commit', '--quiet', '-m', 'Reviewed fixture');
  return { root, git, sha: git('rev-parse', 'HEAD') };
}

test('clean source returns exact HEAD and ignored build output remains allowed', async t => {
  const { root, sha } = await repository(t);
  assert.equal(assertBuildSource(root), sha);
  await mkdir(path.join(root, 'build'));
  await writeFile(path.join(root, 'build', 'artifact.json'), '{}\n');
  assert.equal(assertBuildSource(root, sha), sha);
});

for (const change of ['tracked edit', 'staged edit', 'untracked file']) {
  test(`source provenance refuses ${change} before a build`, async t => {
    const { root, git } = await repository(t);
    await writeFile(path.join(root, change === 'untracked file' ? 'new-source.txt' : 'source.txt'), 'unreviewed source\n');
    if (change === 'staged edit') git('add', 'source.txt');
    assert.throws(() => assertBuildSource(root), /Commit the reviewed source/);
  });
}

test('source changes made during Next cannot be sealed under the original clean HEAD', async t => {
  const { root } = await repository(t);
  const sha = assertBuildSource(root);
  await writeFile(path.join(root, 'source.txt'), 'changed during compilation\n');
  assert.throws(() => assertBuildSource(root, sha), /Commit the reviewed source/);
});

test('a new clean commit during Next cannot be sealed under the original HEAD', async t => {
  const { root, git } = await repository(t);
  const sha = assertBuildSource(root);
  await writeFile(path.join(root, 'source.txt'), 'different committed source\n');
  git('add', 'source.txt');
  git('commit', '--quiet', '-m', 'Concurrent fixture change');
  assert.equal(git('status', '--porcelain'), '');
  assert.notEqual(git('rev-parse', 'HEAD'), sha);
  assert.throws(() => assertBuildSource(root, sha), /Source HEAD changed/);
});

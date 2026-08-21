import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { PUBLIC_CONTACT_EMAIL } from '../lib/site.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicSourceRoots = ['app', 'components', 'lib', 'public'];
const textExtensions = new Set(['.cjs', '.html', '.js', '.json', '.jsx', '.mjs', '.ts', '.tsx', '.txt']);

function textFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) return textFiles(entryPath);
    return textExtensions.has(path.extname(entry.name)) ? [entryPath] : [];
  });
}

test('Goose public surfaces use the product contact instead of a personal address', () => {
  assert.equal(PUBLIC_CONTACT_EMAIL, 'goosegifts@37.technology');

  const forbiddenAddresses = /\b(?:cam|cameron)@37\.technology\b/gi;
  const leaks = publicSourceRoots.flatMap((sourceRoot) =>
    textFiles(path.join(root, sourceRoot)).flatMap((file) => {
      const matches = fs.readFileSync(file, 'utf8').match(forbiddenAddresses) ?? [];
      return matches.map((address) => `${path.relative(root, file)}: ${address}`);
    }),
  );

  assert.deepEqual(leaks, []);
});

test('named authorship is limited to intentional Weird Gift Index attribution', () => {
  const filesWithOwnerName = publicSourceRoots.flatMap((sourceRoot) =>
    textFiles(path.join(root, sourceRoot)).filter((file) =>
      fs.readFileSync(file, 'utf8').includes('Cameron Ehrlich'),
    ),
  );

  assert.deepEqual(
    filesWithOwnerName.map((file) => path.relative(root, file)),
    ['app/weird-gift-index/page.tsx'],
  );

  const indexPage = fs.readFileSync(path.join(root, 'app/weird-gift-index/page.tsx'), 'utf8');
  assert.match(indexPage, /author:\s*\{\s*'@type': 'Person',\s*name: 'Cameron Ehrlich'/);
  assert.match(indexPage, /<span>By Cameron Ehrlich<\/span>/);
  assert.match(indexPage, /Ehrlich, Cameron\. “The Weird Gift Index/);
  assert.match(indexPage, /goose\.gifts is owned and operated by Thirty Seven, Inc\./);
});

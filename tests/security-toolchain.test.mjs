import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';

const require = createRequire(import.meta.url);
const loadConfig = require('tailwindcss/loadConfig');
const nesting = require('tailwindcss/nesting');
const parser = require('postcss-selector-parser');
const root = path.resolve(import.meta.dirname, '..');
const sha256 = (css) => createHash('sha256').update(css).digest('hex');

// Captured with the previous parser (6.1.4). Keep the selector upgrade from
// changing either site's generated variants, @apply behavior or nesting.
const classes = `group hover:shadow-sm focus-visible:outline-none motion-reduce:animate-none
  sm:grid-cols-2 [&>a]:underline group-hover:text-brand peer-checked:opacity-100
  ring-1 ring-brand shadow-sm backdrop-blur space-y-4 -translate-x-1/2
  w-[calc(100%-2rem)] supports-[display:grid]:grid marker:text-brand
  placeholder:text-brand dark:hover:bg-brand [&:is(a,button)]:font-semibold`;

for (const [name, configFile, expected] of [
  ['app', 'tailwind.config.ts', '4e0e52b1f2cbc5c99f5c9681670965fcaa1ed7f7e381b083919c7797fdaa519b'],
  ['static site', 'static-site/tailwind.config.ts', 'd7be683d244813f60df0c492014727557a2fe450fd7c4e13c52b0501d6e6edb9'],
]) {
  test(`patched selector parser preserves ${name} Tailwind output`, async () => {
    const config = loadConfig(path.join(root, configFile));
    config.content = [{ raw: `<div class="${classes}"></div>`, extension: 'html' }];
    const result = await postcss([tailwindcss(config), autoprefixer()]).process(
      '@tailwind utilities;\n.fixture { @apply text-brand shadow-sm ring-1 ring-brand outline-none; }\n',
      { from: undefined },
    );
    assert.deepEqual(result.warnings(), []);
    assert.equal(sha256(result.css), expected);
  });
}

test('patched selector parser preserves Tailwind nesting output', async () => {
  const result = await postcss([nesting()]).process(`
    .card, .tile {
      color: red;
      &:hover, &[data-state="open"] {
        & > a:not(.muted, [aria-hidden="true"]) { color: blue; }
      }
      @media (min-width: 640px) { & + & { display: grid; } }
    }
  `, { from: undefined });
  assert.deepEqual(result.warnings(), []);
  assert.equal(sha256(result.css), '39cfb6889a20078c4f0b82d56803e4aac3af0aae11bd95ea73987c6b09dc89ae');
});

test('patched selector parser handles long flat selectors without changing serialization', () => {
  const selector = '.item'.repeat(8_000);
  assert.equal(parser().processSync(selector), selector);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const robotsPath = new URL('../public/robots.txt', import.meta.url);

test('robots preserves public product discovery while protecting private and high-cost routes', async () => {
  const robots = await readFile(robotsPath, 'utf8');

  assert.match(robots, /User-agent: \*\nDisallow: \/admin\/\nDisallow: \/api\/\nAllow: \//);
  assert.match(robots, /Sitemap: https:\/\/www\.goose\.gifts\/sitemap\.xml/);

  const trainingCrawlerGroup = [
    'User-agent: GPTBot',
    'User-agent: ClaudeBot',
    'User-agent: Applebot-Extended',
    'Disallow: /admin/',
    'Disallow: /api/',
    'Disallow: /random-gift',
    'Allow: /gifts/',
    'Allow: /',
  ].join('\n');

  assert.match(robots, new RegExp(trainingCrawlerGroup.replaceAll('/', '\\/')));
  assert.doesNotMatch(robots, /User-agent: (?:GPTBot|ClaudeBot|Applebot-Extended)\nDisallow: \/\n/);

  for (const allowedBot of ['Google-Extended', 'OAI-SearchBot']) {
    assert.doesNotMatch(robots, new RegExp(`User-agent: ${allowedBot}`));
  }
});

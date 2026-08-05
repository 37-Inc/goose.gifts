import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const robotsPath = new URL('../public/robots.txt', import.meta.url);

test('robots preserves public routes and blocks only the approved model-training bots', async () => {
  const robots = await readFile(robotsPath, 'utf8');

  assert.match(robots, /User-agent: \*\nDisallow: \/admin\/\nDisallow: \/api\/\nAllow: \//);
  assert.match(robots, /Sitemap: https:\/\/www\.goose\.gifts\/sitemap\.xml/);

  for (const bot of ['GPTBot', 'ClaudeBot', 'Applebot-Extended']) {
    assert.match(robots, new RegExp(`User-agent: ${bot}\\nDisallow: /`));
  }

  for (const allowedBot of ['Google-Extended', 'OAI-SearchBot']) {
    assert.doesNotMatch(robots, new RegExp(`User-agent: ${allowedBot}`));
  }
});

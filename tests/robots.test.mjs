import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const robotsPath = new URL('../public/robots.txt', import.meta.url);

function parseRobots(source) {
  const groups = [];
  let group;

  for (const rawLine of source.split('\n')) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;

    const separator = line.indexOf(':');
    if (separator === -1) continue;

    const directive = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();

    if (directive === 'user-agent') {
      if (!group || group.rules.length > 0) {
        group = { agents: [], rules: [] };
        groups.push(group);
      }
      group.agents.push(value.toLowerCase());
    } else if (group && (directive === 'allow' || directive === 'disallow')) {
      group.rules.push({ directive, path: value });
    }
  }

  return groups;
}

function canFetch(groups, userAgent, path) {
  const normalizedAgent = userAgent.toLowerCase();
  const matches = groups.flatMap((group) => group.agents
    .filter((agent) => agent === '*' || normalizedAgent.includes(agent))
    .map((agent) => ({ group, specificity: agent === '*' ? 0 : agent.length })));
  const maxSpecificity = Math.max(...matches.map((match) => match.specificity), -1);
  const applicableRules = matches
    .filter((match) => match.specificity === maxSpecificity)
    .flatMap((match) => match.group.rules)
    .filter((rule) => rule.path && path.startsWith(rule.path));
  const longestMatch = Math.max(...applicableRules.map((rule) => rule.path.length), -1);
  const decisiveRules = applicableRules.filter((rule) => rule.path.length === longestMatch);

  return decisiveRules.length === 0 || decisiveRules.some((rule) => rule.directive === 'allow');
}

test('robots preserves public product discovery while protecting private and high-cost routes', async () => {
  const robots = await readFile(robotsPath, 'utf8');
  const groups = parseRobots(robots);

  assert.match(robots, /Sitemap: https:\/\/www\.goose\.gifts\/sitemap\.xml/);

  const publicPaths = ['/', '/gifts/example-product', '/gift-guides/funny-gifts'];
  const privatePaths = ['/admin/products', '/api/catalog-feed'];

  for (const bot of ['GPTBot', 'ClaudeBot', 'Applebot-Extended']) {
    for (const path of publicPaths) {
      assert.equal(canFetch(groups, bot, path), true, `${bot} should be allowed to fetch ${path}`);
    }
    for (const path of [...privatePaths, '/random-gift', '/random-gift?spin=test']) {
      assert.equal(canFetch(groups, bot, path), false, `${bot} should be blocked from ${path}`);
    }
  }

  for (const bot of ['Googlebot', 'bingbot', 'OAI-SearchBot', 'PerplexityBot']) {
    for (const path of [...publicPaths, '/random-gift']) {
      assert.equal(canFetch(groups, bot, path), true, `${bot} should be allowed to fetch ${path}`);
    }
    for (const path of privatePaths) {
      assert.equal(canFetch(groups, bot, path), false, `${bot} should be blocked from ${path}`);
    }
  }
});

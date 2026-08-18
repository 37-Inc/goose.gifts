import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { getGiftGuideFaqs } from '../lib/gift-guide-editorial.ts';

const giftGuidesPath = new URL('../lib/gift-guides.ts', import.meta.url);

test('page-specific FAQ overrides replace the shared fallback', () => {
  const guide = {
    title: 'Funny Gifts for Coworkers',
    intro: 'Office gifts need a narrow lane.',
    faqs: [
      {
        question: 'What makes a funny coworker gift office-safe?',
        answer: 'Use a harmless work routine as the joke.',
      },
      {
        question: 'What is a good funny gift for a boss?',
        answer: 'Choose a modest team gift with no personal edge.',
      },
    ],
  };
  const faqs = getGiftGuideFaqs(guide);
  assert.equal(faqs.length, 2);
  assert.equal(faqs[0].question, 'What makes a funny coworker gift office-safe?');
  assert.match(faqs[1].answer, /team gift/i);
});

test('guides without overrides keep the shared three-question fallback', () => {
  const guide = {
    title: 'Weird Kitchen Gadgets',
    intro: 'Useful once and funny every time.',
  };

  assert.equal(getGiftGuideFaqs(guide).length, 3);
  assert.match(getGiftGuideFaqs(guide)[0].question, /what makes a good weird kitchen gadgets/i);
});

test('the dad guide answers observed dad-joke and hobby intent with specific guidance', async () => {
  const source = await readFile(giftGuidesPath, 'utf8');
  const dadGuide = source.match(/slug: 'funny-gifts-for-dads',[\s\S]*?\n  \},\n  \{\n    slug: 'weird-kitchen-gadgets'/)?.[0];

  assert.ok(dadGuide);
  assert.match(dadGuide, /metadataTitle: 'Funny Dad Gifts and Dad Joke Gifts'/);
  assert.match(dadGuide, /thermostat.*coffee.*home repair.*grill/);
  assert.match(dadGuide, /sizes, brands, or technical preferences/);
  assert.match(dadGuide, /slug: 'funny-gifts-for-dads-who-fish'/);
  assert.match(dadGuide, /slug: 'weird-kitchen-gadgets'/);
  assert.match(dadGuide, /slug: 'funny-golf-gifts'/);
  assert.match(dadGuide, /recognize the hobby/);
});

test('the Secret Santa guide separates assigned-recipient intent from group exchanges', async () => {
  const source = await readFile(giftGuidesPath, 'utf8');
  const secretSantaGuide = source.match(/slug: 'secret-santa-gag-gifts',[\s\S]*?\n  \},\n  \{\n    slug: 'dirty-santa-gifts'/)?.[0];

  assert.ok(secretSantaGuide);
  assert.match(secretSantaGuide, /metadataTitle: 'Funny Secret Santa Gifts and Gag Gift Ideas'/);
  assert.match(secretSantaGuide, /choosing for one person/);
  assert.match(secretSantaGuide, /where will it be opened, who else will be there/);
  assert.match(secretSantaGuide, /confirm the current price at the retailer/);
  assert.match(secretSantaGuide, /slug: 'funny-gifts-for-coworkers'/);
  assert.match(secretSantaGuide, /slug: 'white-elephant-gifts'/);
  assert.match(secretSantaGuide, /Are Secret Santa and white elephant gifts the same/);
});

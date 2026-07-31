import assert from 'node:assert/strict';
import test from 'node:test';

import { getGiftGuideFaqs } from '../lib/gift-guide-editorial.ts';

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

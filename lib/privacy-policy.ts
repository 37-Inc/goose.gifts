import { PUBLIC_CONTACT_EMAIL } from './site';

// Existing published policy, shared without substantive copy/date changes.
export const privacyPolicyUpdated = 'August 21, 2026';
export const privacyPolicyIntro = 'This policy explains how goose.gifts handles information for visitors using the site.';
export const privacyPolicySections = [
  {
    title: 'Information We Collect',
    body: [
      'goose.gifts may collect basic usage information, such as pages viewed, searches submitted, approximate device and browser information, referring pages, and product links clicked.',
      'If you contact us directly, we may receive the contact information and message content you choose to provide.',
    ],
  },
  {
    title: 'How We Use Information',
    body: [
      'We use usage information to improve gift recommendations, understand which products and guides are useful, maintain site reliability, and measure traffic and affiliate-link performance.',
      'We do not sell personal information.',
    ],
  },
  {
    title: 'Affiliate Links',
    body: [
      'goose.gifts links to third-party retailers and may earn commissions from qualifying purchases. Retailers and affiliate networks may use cookies or similar technologies under their own policies when you leave goose.gifts.',
    ],
  },
  {
    title: 'Analytics',
    body: [
      'We may use analytics tools to understand aggregate site activity, including searches, page views, outbound product clicks, and referral sources.',
      'Third-party analytics receive only limited event details such as page paths, result counts, product identifiers and sources, link domains, and coarse campaign attribution. We do not send them search or recipient text, affiliate URLs, URL query strings, form contents, or session recordings. Browser Do Not Track and Global Privacy Control signals disable Google Analytics and PostHog collection.',
    ],
  },
  {
    title: 'Third-Party Sites',
    body: [
      'Product links and social links may send you to third-party websites. Their privacy practices are governed by their own privacy policies.',
    ],
  },
  {
    title: 'Contact',
    body: [
      `For privacy questions about goose.gifts, contact ${PUBLIC_CONTACT_EMAIL}.`,
    ],
  },
];

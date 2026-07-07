import type { Metadata } from 'next';
import { Header } from '@/components/Header';

export const metadata: Metadata = {
  title: 'Privacy Policy | goose.gifts',
  description: 'Privacy policy for goose.gifts.',
  alternates: {
    canonical: '/privacy',
  },
};

const sections = [
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
      'For privacy questions about goose.gifts, contact cameron@37.technology.',
    ],
  },
];

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-950">
      <Header />

      <section className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-red-600">
          goose.gifts
        </p>
        <h1 className="mt-2 text-4xl font-black tracking-tight text-zinc-950">
          Privacy Policy
        </h1>
        <p className="mt-4 text-sm leading-6 text-zinc-600">
          Last updated July 7, 2026
        </p>
        <p className="mt-6 text-base leading-7 text-zinc-700">
          This policy explains how goose.gifts handles information for visitors
          using the site.
        </p>

        <div className="mt-10 space-y-8">
          {sections.map((section) => (
            <section key={section.title}>
              <h2 className="text-xl font-bold tracking-tight text-zinc-950">
                {section.title}
              </h2>
              <div className="mt-3 space-y-3 text-base leading-7 text-zinc-700">
                {section.body.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
            </section>
          ))}
        </div>
      </section>
    </main>
  );
}

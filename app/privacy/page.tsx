import type { Metadata } from 'next';
import { Header } from '@/components/Header';
import { privacyPolicySections as sections, privacyPolicyUpdated, privacyPolicyIntro } from '@/lib/privacy-policy';

export const metadata: Metadata = {
  title: 'Privacy Policy | goose.gifts',
  description: 'Privacy policy for goose.gifts.',
  alternates: {
    canonical: '/privacy',
  },
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-white text-zinc-950">
      <Header />

      <section className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
        <h1 className="text-4xl font-extrabold tracking-tight text-zinc-950">
          Privacy Policy
        </h1>
        <p className="mt-3 text-sm leading-6 text-zinc-400">
          Last updated {privacyPolicyUpdated}
        </p>
        <p className="mt-6 text-base leading-7 text-zinc-600">
          {privacyPolicyIntro}
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

import type { Metadata } from 'next';
import Link from 'next/link';
import { Header } from '@/components/Header';
import { giftGuides } from '@/lib/gift-guides';
import { getSiteUrl } from '@/lib/site';

const GUIDE_INDEX_TITLE = 'Funny Gift Guides';
const GUIDE_INDEX_DESCRIPTION = 'Browse every goose.gifts guide for funny gag gifts, white elephant ideas, coworker gifts, weird kitchen finds, novelty desk toys, and hard-to-shop-for people.';

const guideSections = [
  {
    title: 'Gift exchanges and holidays',
    description: 'Fast lists for white elephant, Secret Santa, stockings, party swaps, and seasonal gift moments.',
    slugs: [
      'white-elephant-gifts',
      'white-elephant-gifts-for-adults',
      'secret-santa-gag-gifts',
      'dirty-santa-gifts',
      'funny-stocking-stuffers',
      'funny-christmas-gifts',
      'funny-halloween-gifts',
      'funny-valentines-gifts',
    ],
  },
  {
    title: 'People who are hard to shop for',
    description: 'Recipient-specific ideas for family, friends, coworkers, bosses, teachers, nurses, gamers, readers, and pet people.',
    slugs: [
      'funny-gifts-for-dads',
      'funny-gifts-for-dads-who-fish',
      'funny-gifts-for-moms',
      'funny-gifts-for-men',
      'funny-gifts-for-women',
      'gifts-for-people-who-have-everything',
      'funny-gifts-for-coworkers',
      'funny-gifts-for-bosses',
      'funny-gifts-for-teachers',
      'funny-gifts-for-nurses',
      'funny-gifts-for-gamers',
      'funny-book-lover-gifts',
      'cat-lover-gag-gifts',
      'dog-lover-gag-gifts',
      'funny-sports-fan-gifts',
    ],
  },
  {
    title: 'Rooms, hobbies, and running jokes',
    description: 'Catalog-backed pages for offices, kitchens, bathrooms, home decor, golf, gardening, coffee, wine, and deeply unserious pranks.',
    slugs: [
      'weird-kitchen-gadgets',
      'funny-cooking-gifts',
      'novelty-desk-toys',
      'office-prank-gifts',
      'prank-gifts-for-friends',
      'funny-birthday-gag-gifts',
      'funny-retirement-gifts',
      'funny-coffee-mugs',
      'funny-poop-gifts',
      'weird-bathroom-gifts',
      'funny-bath-gifts',
      'funny-housewarming-gifts',
      'funny-hostess-gifts',
      'weird-home-decor-gifts',
      'optical-illusion-decor-gifts',
      'sarcastic-gifts',
      'funny-wine-gifts',
      'adult-coloring-book-gifts',
      'funny-golf-gifts',
      'funny-gardening-gifts',
    ],
  },
];

function getGuide(slug: string) {
  const guide = giftGuides.find((item) => item.slug === slug);

  if (!guide) {
    throw new Error(`Missing gift guide definition for ${slug}`);
  }

  return guide;
}

export const metadata: Metadata = {
  title: `${GUIDE_INDEX_TITLE} | goose.gifts`,
  description: GUIDE_INDEX_DESCRIPTION,
  alternates: {
    canonical: '/gift-guides',
  },
  openGraph: {
    title: `${GUIDE_INDEX_TITLE} | goose.gifts`,
    description: GUIDE_INDEX_DESCRIPTION,
    url: '/gift-guides',
    siteName: 'goose.gifts',
    type: 'website',
    images: [
      {
        url: '/sillygoose-og.png',
        width: 1200,
        height: 630,
        alt: 'goose.gifts funny gift guide directory',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: `${GUIDE_INDEX_TITLE} | goose.gifts`,
    description: GUIDE_INDEX_DESCRIPTION,
    images: ['/sillygoose-og.png'],
  },
};

export default function GiftGuideIndexPage() {
  const baseUrl = getSiteUrl();
  const url = `${baseUrl}/gift-guides`;
  const schema = JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage',
        '@id': `${url}#webpage`,
        name: GUIDE_INDEX_TITLE,
        headline: 'Funny gift guides for every kind of ridiculous present',
        description: GUIDE_INDEX_DESCRIPTION,
        url,
        inLanguage: 'en-US',
        isPartOf: {
          '@type': 'WebSite',
          name: 'goose.gifts',
          url: baseUrl,
        },
      },
      {
        '@type': 'ItemList',
        '@id': `${url}#guides`,
        name: 'goose.gifts guide directory',
        numberOfItems: giftGuides.length,
        itemListElement: giftGuides.map((guide, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          url: `${baseUrl}/gift-guides/${guide.slug}`,
          name: guide.title,
          description: guide.description,
        })),
      },
    ],
  }).replace(/</g, '\\u003c');

  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-950">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: schema }}
      />

      <Header />

      <section className="mx-auto max-w-7xl px-4 py-8 sm:py-12">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-red-600">
            Catalog-backed gift ideas
          </p>
          <h1 className="mt-2 text-4xl font-black tracking-tight text-zinc-950 sm:text-5xl">
            Funny gift guides for every kind of ridiculous present.
          </h1>
          <p className="mt-4 text-base leading-7 text-zinc-600 sm:text-lg">
            Browse the maintained goose.gifts guide network: holiday exchanges, office-safe jokes, weird home finds, pet-person presents, and hard-to-shop-for recipient lists backed by the live catalog.
          </p>
        </div>
      </section>

      <section className="border-y border-zinc-200 bg-white py-8 sm:py-10">
        <div className="mx-auto max-w-7xl px-4">
          <div className="grid gap-8 lg:grid-cols-3">
            {guideSections.map((section) => (
              <section key={section.title} aria-labelledby={`${section.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-heading`}>
                <h2
                  id={`${section.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-heading`}
                  className="text-2xl font-bold text-zinc-950"
                >
                  {section.title}
                </h2>
                <p className="mt-2 text-sm leading-6 text-zinc-600">
                  {section.description}
                </p>
                <div className="mt-5 flex flex-col gap-2">
                  {section.slugs.map((slug) => {
                    const guide = getGuide(slug);

                    return (
                      <Link
                        key={guide.slug}
                        href={`/gift-guides/${guide.slug}`}
                        className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 transition hover:border-zinc-400 hover:bg-white"
                      >
                        <span className="block text-sm font-bold text-zinc-950">
                          {guide.title}
                        </span>
                        <span className="mt-1 block text-sm leading-6 text-zinc-600">
                          {guide.intro}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-8 sm:py-10">
        <div className="max-w-3xl">
          <h2 className="text-2xl font-bold text-zinc-950">
            How these guides stay useful
          </h2>
          <p className="mt-3 text-sm leading-6 text-zinc-600">
            Each guide points at active catalog products with images and affiliate URLs. The daily catalog run refreshes discovery, product copy, and matching signals so these pages can improve as new funny, weird, and actually purchasable products appear.
          </p>
        </div>
      </section>
    </main>
  );
}

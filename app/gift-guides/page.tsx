import type { Metadata } from 'next';
import { Header } from '@/components/Header';
import { PageHero, HeroUnderline } from '@/components/ui/PageHero';
import { BrowseCard } from '@/components/ui/SectionHeading';
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
    <main className="min-h-screen bg-white text-zinc-950">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: schema }}
      />

      <Header />

      <PageHero
        title={<>Funny gift guides for every <HeroUnderline>ridiculous</HeroUnderline> present</>}
        subtitle="Holiday exchanges, office-safe jokes, weird home finds, pet-person presents, and hard-to-shop-for recipient lists — every guide backed by the live catalog."
      />

      <div className="mx-auto max-w-6xl px-4 pb-16 pt-12 sm:pt-14">
        <div className="grid gap-x-8 gap-y-10 lg:grid-cols-3">
          {guideSections.map((section) => {
            const headingId = `${section.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-heading`;
            return (
              <section key={section.title} aria-labelledby={headingId}>
                <h2 id={headingId} className="text-lg font-bold tracking-tight text-zinc-950">
                  {section.title}
                </h2>
                <p className="mt-2 text-sm leading-6 text-zinc-500">
                  {section.description}
                </p>
                <div className="mt-5 flex flex-col gap-2">
                  {section.slugs.map((slug) => {
                    const guide = getGuide(slug);
                    return (
                      <BrowseCard
                        key={guide.slug}
                        href={`/gift-guides/${guide.slug}`}
                        title={guide.title}
                        description={guide.intro}
                      />
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>

        <div className="mx-auto mt-16 max-w-2xl border-t border-zinc-100 pt-8 text-center">
          <h2 className="text-lg font-bold tracking-tight text-zinc-950">
            How these guides stay useful
          </h2>
          <p className="mt-3 text-pretty text-sm leading-6 text-zinc-500">
            Each guide points at active catalog products with real images and affiliate links. The daily catalog run refreshes discovery, product copy, and matching signals, so these pages keep getting better as new funny, weird, and actually purchasable products appear.
          </p>
        </div>
      </div>
    </main>
  );
}

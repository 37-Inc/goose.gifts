import type { Metadata } from 'next';
import Link from 'next/link';
import { Header } from '@/components/Header';
import { getSiteUrl } from '@/lib/site';
import { getWeirdGiftIndex } from '@/lib/weird-gift-index';
import {
  HUMOR_SIGNAL_TERMS,
  MOTIF_DEFINITIONS,
} from '@/lib/weird-gift-index-analysis';

// Preview deployments intentionally do not receive the production database
// secret. Keep the report request-time rendered so builds never require live
// catalog credentials; the underlying aggregate remains cached for one hour.
export const dynamic = 'force-dynamic';

const INDEX_TITLE = 'The Weird Gift Index: What 3,000+ Ridiculous Products Reveal';
const INDEX_DESCRIPTION = 'Original analysis of 3,000+ active gift listings: the animals, pranks, food references, and strange language that define the weird-gift catalog.';

export const metadata: Metadata = {
  title: `${INDEX_TITLE} | goose.gifts`,
  description: INDEX_DESCRIPTION,
  alternates: {
    canonical: '/weird-gift-index',
  },
  openGraph: {
    title: `${INDEX_TITLE} | goose.gifts`,
    description: INDEX_DESCRIPTION,
    url: '/weird-gift-index',
    siteName: 'goose.gifts',
    type: 'article',
    publishedTime: '2026-07-12T00:00:00-07:00',
    images: [
      {
        url: '/weird-gift-index/opengraph-image',
        width: 1200,
        height: 630,
        alt: 'The Weird Gift Index from goose.gifts',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: `${INDEX_TITLE} | goose.gifts`,
    description: INDEX_DESCRIPTION,
    images: ['/weird-gift-index/opengraph-image'],
  },
};

function number(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}

function percent(count: number, total: number): string {
  if (total === 0) return '0%';
  return `${((count / total) * 100).toFixed(1)}%`;
}

function multiple(a: number, b: number): string {
  if (b === 0) return 'not comparable';
  return `${(a / b).toFixed(1)}×`;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'America/Los_Angeles',
  }).format(new Date(value));
}

export default async function WeirdGiftIndexPage() {
  const index = await getWeirdGiftIndex();
  const baseUrl = getSiteUrl();
  const url = `${baseUrl}/weird-gift-index`;
  const animals = index.motifs.find((motif) => motif.id === 'animals')!;
  const food = index.motifs.find((motif) => motif.id === 'food-drink')!;
  const bathroom = index.motifs.find((motif) => motif.id === 'bathroom')!;
  const adultAnatomy = index.motifs.find((motif) => motif.id === 'adult-anatomy')!;
  const funny = index.titleSignals.find((signal) => signal.term === 'funny')!;
  const weird = index.titleSignals.find((signal) => signal.term === 'weird')!;
  const displayedSignals = index.titleSignals.filter((signal) => signal.count > 0).slice(0, 8);
  const maxMotifCount = Math.max(...index.motifs.map((motif) => motif.count), 1);
  const maxSignalCount = Math.max(...displayedSignals.map((signal) => signal.count), 1);
  const updatedDate = formatDate(index.catalogUpdatedAt);
  const priceCoverage = percent(index.knownPriceCount, index.totalProducts);
  const funnyToWeird = weird.count > 0 ? Math.round(funny.count / weird.count) : null;
  const humorSignalPercent = percent(index.humorSignalCount, index.totalProducts);
  const straightFacedCount = index.totalProducts - index.humorSignalCount;
  const straightFacedPercent = percent(straightFacedCount, index.totalProducts);
  const sourceCount = index.sourceCounts.length;
  const topMotif = index.motifs[0];
  const faqs = [
    {
      question: 'What is the Weird Gift Index?',
      answer: `The Weird Gift Index is a first-party content analysis of ${number(index.totalProducts)} active product listings in the goose.gifts catalog. It measures recurring language and motifs in merchant titles; it does not measure sales or popularity.`,
    },
    {
      question: 'What is the most common weird-gift motif in this catalog?',
      answer: `The largest motif in this edition is ${topMotif.label}: ${number(topMotif.count)} listing titles (${topMotif.percentage.toFixed(1)}%) match at least one term in its published classification dictionary.`,
    },
    {
      question: 'How are products classified?',
      answer: 'The analysis lowercases each merchant title, replaces punctuation with spaces, and looks for whole words or phrases from the published motif dictionary. Categories overlap, so one title can count as both an animal gift and bathroom humor.',
    },
    {
      question: 'Why does the report not compare gift prices?',
      answer: `Only ${number(index.knownPriceCount)} of ${number(index.totalProducts)} active listings (${priceCoverage}) currently have a usable catalog price. That coverage is too thin for a responsible price comparison, so this edition excludes price conclusions.`,
    },
  ];
  const schema = JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Article',
        '@id': `${url}#article`,
        headline: INDEX_TITLE,
        description: INDEX_DESCRIPTION,
        url,
        datePublished: index.publishedAt,
        dateModified: index.catalogUpdatedAt,
        inLanguage: 'en-US',
        mainEntityOfPage: {
          '@id': `${url}#webpage`,
        },
        author: {
          '@type': 'Person',
          name: 'Cameron Ehrlich',
        },
        publisher: {
          '@id': `${baseUrl}/#organization`,
        },
        image: `${url}/opengraph-image`,
        about: ['weird gifts', 'gag gifts', 'novelty products', 'gift trends'],
      },
      {
        '@type': 'WebPage',
        '@id': `${url}#webpage`,
        name: INDEX_TITLE,
        description: INDEX_DESCRIPTION,
        url,
        isPartOf: {
          '@id': `${baseUrl}/#website`,
        },
        mainEntity: {
          '@id': `${url}#dataset`,
        },
      },
      {
        '@type': 'Dataset',
        '@id': `${url}#dataset`,
        name: `goose.gifts Weird Gift Index ${index.version}`,
        description: `Aggregate title analysis of ${number(index.totalProducts)} active gift-product listings in the goose.gifts catalog.`,
        url,
        datePublished: index.publishedAt,
        dateModified: index.catalogUpdatedAt,
        creator: {
          '@id': `${baseUrl}/#organization`,
        },
        measurementTechnique: 'Case-insensitive whole-word and phrase matching against a published motif dictionary',
        variableMeasured: [
          'Active catalog listing count',
          'Merchant-title humor signals',
          'Merchant-title product motifs',
          'Cross-category motif overlap',
          'Known-price coverage',
        ],
        distribution: {
          '@type': 'DataDownload',
          encodingFormat: 'application/json',
          contentUrl: `${url}/data`,
        },
      },
      {
        '@type': 'BreadcrumbList',
        '@id': `${url}#breadcrumbs`,
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: 'Home',
            item: baseUrl,
          },
          {
            '@type': 'ListItem',
            position: 2,
            name: 'Weird Gift Index',
            item: url,
          },
        ],
      },
      {
        '@type': 'FAQPage',
        '@id': `${url}#faq`,
        mainEntity: faqs.map((faq) => ({
          '@type': 'Question',
          name: faq.question,
          acceptedAnswer: {
            '@type': 'Answer',
            text: faq.answer,
          },
        })),
      },
    ],
  }).replace(/</g, '\\u003c');

  return (
    <main className="min-h-screen bg-[#f5f1e8] text-zinc-950">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: schema }} />
      <Header />

      <article>
        <header className="overflow-hidden border-b border-zinc-900 bg-zinc-950 text-white">
          <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:py-20 lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.65fr)] lg:items-end">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.24em] text-orange-300">
                Original catalog research · Edition {index.version}
              </p>
              <h1 className="mt-5 max-w-4xl text-5xl font-black leading-[0.96] tracking-[-0.045em] sm:text-7xl">
                The Weird Gift Index
              </h1>
              <p className="mt-6 max-w-3xl text-xl leading-8 text-zinc-300 sm:text-2xl">
                A first-party read on {number(index.totalProducts)} active gift listings: the animals, pranks, and bathroom jokes that fill the novelty aisle — and the oddly ordinary language merchants use to sell them.
              </p>
              <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-zinc-400">
                <span>By Cameron Ehrlich</span>
                <span>Published July 12, 2026</span>
                <span>Catalog updated {updatedDate}</span>
              </div>
            </div>

            <div className="rounded-2xl border border-white/15 bg-white/5 p-6 backdrop-blur">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-orange-300">
                The short answer
              </p>
              <p className="mt-3 text-2xl font-bold leading-8 text-white">
                In this catalog, animal motifs are {multiple(animals.count, bathroom.count)} as common as bathroom-humor motifs.
              </p>
              <p className="mt-4 text-sm leading-6 text-zinc-300">
                Animal words appear in {number(animals.count)} titles ({animals.percentage.toFixed(1)}%); bathroom-humor words in just {number(bathroom.count)} ({bathroom.percentage.toFixed(1)}%). These are inventory counts — what sits on the shelf, not what sells.
              </p>
            </div>
          </div>
        </header>

        <section aria-labelledby="findings-heading" className="mx-auto max-w-7xl px-4 py-12 sm:py-16">
          <div className="max-w-3xl">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-red-700">Four findings</p>
            <h2 id="findings-heading" className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
              The catalog is stranger than the sales copy.
            </h2>
            <p className="mt-4 text-base leading-7 text-zinc-700">
              Every number below counts words in original merchant titles — nothing else. No sales, no search demand, and categories that freely overlap. Here is what the catalog keeps saying about itself.
            </p>
          </div>

          <div className="mt-8 grid gap-px overflow-hidden rounded-2xl border border-zinc-300 bg-zinc-300 sm:grid-cols-2 lg:grid-cols-4">
            <section className="bg-white p-6">
              <p className="text-5xl font-black tracking-tighter">{animals.percentage.toFixed(1)}%</p>
              <h3 className="mt-4 text-lg font-bold">Animals run the catalog</h3>
              <p className="mt-2 text-sm leading-6 text-zinc-600">
                {number(animals.count)} titles name an animal{topMotif.id === 'animals' ? ' — the single largest motif' : ''}. {number(index.crossovers.animalsWithHumorSignal)} of them also flag an explicit humor word.
              </p>
            </section>
            <section className="bg-white p-6">
              <p className="text-5xl font-black tracking-tighter">{funnyToWeird ? `${number(funnyToWeird)}:1` : '—'}</p>
              <h3 className="mt-4 text-lg font-bold">“Funny” buries “weird”</h3>
              <p className="mt-2 text-sm leading-6 text-zinc-600">
                Merchants reach for “funny” {number(funny.count)} times but “weird” only {number(weird.count)} — in a catalog built entirely on the weird.
              </p>
            </section>
            <section className="bg-white p-6">
              <p className="text-5xl font-black tracking-tighter">{multiple(food.count, bathroom.count)}</p>
              <h3 className="mt-4 text-lg font-bold">Snacks beat toilet jokes</h3>
              <p className="mt-2 text-sm leading-6 text-zinc-600">
                Food and drink motifs show up in {number(food.count)} titles versus {number(bathroom.count)} for bathroom humor. On the shelf, cravings outrank gross-outs.
              </p>
            </section>
            <section className="bg-white p-6">
              <p className="text-5xl font-black tracking-tighter">{adultAnatomy.percentage.toFixed(1)}%</p>
              <h3 className="mt-4 text-lg font-bold">Explicit is a tiny lane</h3>
              <p className="mt-2 text-sm leading-6 text-zinc-600">
                Only {number(adultAnatomy.count)} titles match the adult-anatomy dictionary. Weird, it turns out, rarely means NSFW.
              </p>
            </section>
          </div>
        </section>

        <section aria-labelledby="motifs-heading" className="border-y border-zinc-300 bg-white py-12 sm:py-16">
          <div className="mx-auto grid max-w-7xl gap-10 px-4 lg:grid-cols-[minmax(16rem,0.7fr)_minmax(0,1.3fr)]">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-red-700">Motif map</p>
              <h2 id="motifs-heading" className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
                What weird gifts are made of
              </h2>
              <p className="mt-4 text-base leading-7 text-zinc-600">
                Each bar counts titles containing at least one term in that motif dictionary. A title can appear in more than one bar, so these categories should not be added together.
              </p>
              <p className="mt-5 rounded-lg bg-[#f5f1e8] p-4 text-sm leading-6 text-zinc-700">
                Example overlap: {number(index.crossovers.animalsWithBathroomHumor)} listings combine an animal term with bathroom humor.
              </p>
            </div>

            <div className="space-y-5">
              {index.motifs.map((motif) => (
                <div key={motif.id}>
                  <div className="mb-2 flex items-baseline justify-between gap-4">
                    <div>
                      <span className="font-bold text-zinc-950">{motif.label}</span>
                      <span className="ml-2 text-sm text-zinc-600">{motif.percentage.toFixed(1)}%</span>
                    </div>
                    <span className="font-mono text-sm font-bold text-zinc-700">{number(motif.count)}</span>
                  </div>
                  <div
                    className="h-4 overflow-hidden rounded-full bg-zinc-100"
                    role="img"
                    aria-label={`${motif.label}: ${number(motif.count)} of ${number(index.totalProducts)} listings, ${motif.percentage.toFixed(1)} percent`}
                  >
                    <div
                      className="h-full rounded-full bg-red-700"
                      style={{ width: `${Math.max((motif.count / maxMotifCount) * 100, 1)}%` }}
                    />
                  </div>
                </div>
              ))}
              <p className="pt-1 text-xs leading-5 text-zinc-500">
                Bars are scaled to the largest motif — {topMotif.label}, at {number(topMotif.count)} listings. Values are the share of all {number(index.totalProducts)} active listings.
              </p>
            </div>
          </div>
        </section>

        <section aria-labelledby="language-heading" className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:py-16 lg:grid-cols-2">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-red-700">Merchant language</p>
            <h2 id="language-heading" className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
              Sellers call it “funny.” Almost nobody calls it “weird.”
            </h2>
            <p className="mt-4 text-base leading-7 text-zinc-600">
              Only {number(index.humorSignalCount)} of {number(index.totalProducts)} active titles ({humorSignalPercent}) use any of the {HUMOR_SIGNAL_TERMS.length} explicit humor words we track. The other {number(straightFacedCount)} ({straightFacedPercent}) sell the gag with a straight face — no “funny,” no “gag,” no wink at all.
            </p>
            <div className="mt-6 rounded-2xl bg-zinc-950 p-6 text-white">
              <p className="font-mono text-sm text-orange-300">FUNNY / WEIRD</p>
              <div className="mt-3 flex items-end gap-4">
                <span className="text-6xl font-black tracking-tighter">{number(funny.count)}</span>
                <span className="pb-2 text-2xl text-zinc-500">/</span>
                <span className="pb-1 text-4xl font-black tracking-tighter">{number(weird.count)}</span>
              </div>
              <p className="mt-4 text-sm leading-6 text-zinc-300">
                Exact whole-word matches in active merchant titles. No generated goose.gifts copy is included.
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-300 bg-white p-6 sm:p-8">
            <h3 className="text-xl font-bold">Explicit humor words in titles</h3>
            <p className="mt-2 text-sm leading-6 text-zinc-600">
              Whole-word matches in active merchant titles, ranked by count.
            </p>
            <div className="mt-6 space-y-4">
              {displayedSignals.map((signal) => (
                <div key={signal.term} className="grid grid-cols-[5.5rem_minmax(0,1fr)_3rem] items-center gap-3">
                  <span className="font-mono text-sm">{signal.term}</span>
                  <div
                    className="h-3 overflow-hidden rounded-full bg-zinc-100"
                    role="img"
                    aria-label={`${signal.term}: ${number(signal.count)} titles, ${signal.percentage.toFixed(1)} percent`}
                  >
                    <div
                      className="h-full rounded-full bg-orange-600"
                      style={{ width: `${Math.max((signal.count / maxSignalCount) * 100, 1)}%` }}
                    />
                  </div>
                  <span className="text-right font-mono text-sm font-bold">{number(signal.count)}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section aria-labelledby="method-heading" className="border-y border-zinc-300 bg-[#e9e1d2] py-12 sm:py-16">
          <div className="mx-auto max-w-5xl px-4">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-red-700">Methodology</p>
            <h2 id="method-heading" className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
              How the Weird Gift Index works
            </h2>
            <div className="mt-8 grid gap-8 md:grid-cols-2">
              <div className="space-y-5 text-sm leading-6 text-zinc-700">
                <div>
                  <h3 className="font-bold text-zinc-950">Dataset</h3>
                  <p className="mt-1">
                    This edition covers {number(index.totalProducts)} active goose.gifts catalog listings — each with both an image and an outbound affiliate URL — drawn from {number(sourceCount)} retail {sourceCount === 1 ? 'source' : 'sources'}. It is a snapshot of one catalog, not a census of every gift sold online.
                  </p>
                </div>
                <div>
                  <h3 className="font-bold text-zinc-950">Classification</h3>
                  <p className="mt-1">
                    We analyze original merchant titles only. Titles are lowercased, punctuation becomes spaces, and whole words or phrases are matched against the published dictionaries below. Generated titles, descriptions, tags, and search queries are excluded.
                  </p>
                </div>
                <div>
                  <h3 className="font-bold text-zinc-950">Interpretation</h3>
                  <p className="mt-1">
                    Counts describe available inventory, not purchases, search demand, cultural importance, or product quality. Categories overlap and the dictionaries are deliberately narrow, so counts are reproducible but not exhaustive.
                  </p>
                </div>
                <div>
                  <h3 className="font-bold text-zinc-950">Price limitation</h3>
                  <p className="mt-1">
                    Only {number(index.knownPriceCount)} listings ({priceCoverage}) have a usable price in the current catalog. This edition makes no price or budget claims.
                  </p>
                </div>
                <div>
                  <h3 className="font-bold text-zinc-950">Disclosure &amp; contact</h3>
                  <p className="mt-1">
                    Cameron Ehrlich operates goose.gifts. The site is affiliate-supported and may earn commissions from qualifying purchases, but this report uses aggregate catalog inventory rather than sales or commission data. Questions and corrections: <a className="underline decoration-zinc-400 underline-offset-2 hover:text-red-800" href="mailto:cameron@37.technology">cameron@37.technology</a>.
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                {MOTIF_DEFINITIONS.map((motif) => (
                  <details key={motif.id} className="rounded-lg border border-zinc-300 bg-white px-4 py-3">
                    <summary className="cursor-pointer text-sm font-bold text-zinc-950">
                      {motif.label} dictionary ({motif.terms.length} terms)
                    </summary>
                    <p className="mt-3 font-mono text-xs leading-5 text-zinc-600">
                      {motif.terms.join(', ')}
                    </p>
                  </details>
                ))}
                <details className="rounded-lg border border-zinc-300 bg-white px-4 py-3">
                  <summary className="cursor-pointer text-sm font-bold text-zinc-950">
                    Humor-signal dictionary ({HUMOR_SIGNAL_TERMS.length} terms)
                  </summary>
                  <p className="mt-3 font-mono text-xs leading-5 text-zinc-600">
                    {HUMOR_SIGNAL_TERMS.join(', ')}
                  </p>
                </details>
              </div>
            </div>

            <div className="mt-8 flex flex-col gap-3 rounded-xl border border-zinc-400 bg-white p-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="font-bold">Want to inspect the aggregates?</h3>
                <p className="mt-1 text-sm text-zinc-600">The machine-readable file contains counts, percentages, dictionaries, and limitations—no product titles or retailer images.</p>
              </div>
              <Link
                href="/weird-gift-index/data"
                className="shrink-0 rounded-full bg-zinc-950 px-5 py-2.5 text-center text-sm font-bold text-white hover:bg-red-800"
              >
                View aggregate JSON
              </Link>
            </div>
          </div>
        </section>

        <section aria-labelledby="faq-heading" className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:py-16 lg:grid-cols-[minmax(16rem,0.65fr)_minmax(0,1.35fr)]">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-red-700">Quick answers</p>
            <h2 id="faq-heading" className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
              Questions about the index
            </h2>
          </div>
          <div className="divide-y divide-zinc-300 border-y border-zinc-300">
            {faqs.map((faq) => (
              <section key={faq.question} className="py-6">
                <h3 className="text-lg font-bold">{faq.question}</h3>
                <p className="mt-2 text-sm leading-6 text-zinc-600">{faq.answer}</p>
              </section>
            ))}
          </div>
        </section>

        <section className="bg-red-800 py-10 text-white">
          <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-red-200">Suggested citation</p>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-red-50">
                Ehrlich, Cameron. “The Weird Gift Index: What {number(index.totalProducts)} Ridiculous Products Reveal.” goose.gifts, edition {index.version}, updated {updatedDate}.
              </p>
            </div>
            <Link href="/gift-guides" className="shrink-0 rounded-full border border-white/40 px-5 py-2.5 text-sm font-bold hover:bg-white hover:text-red-800">
              Browse the gift guides
            </Link>
          </div>
        </section>
      </article>
    </main>
  );
}

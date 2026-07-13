export interface WeirdGiftCatalogRow {
  title: string;
  price: string | number;
  source: string;
  updatedAt: Date | string;
}

export const WEIRD_GIFT_INDEX_VERSION = '2026.1';
export const WEIRD_GIFT_INDEX_PUBLISHED = '2026-07-12';

export const HUMOR_SIGNAL_TERMS = [
  'funny',
  'gag',
  'prank',
  'weird',
  'novelty',
  'silly',
  'hilarious',
  'joke',
  'sarcastic',
  'ridiculous',
] as const;

export const TITLE_SIGNAL_TERMS = [
  'funny',
  'gag',
  'novelty',
  'joke',
  'prank',
  'hilarious',
  'sarcastic',
  'silly',
  'weird',
  'ridiculous',
] as const;

export const MOTIF_DEFINITIONS = [
  {
    id: 'animals',
    label: 'Animals',
    description: 'Titles that name at least one animal.',
    terms: [
      'dog', 'dogs', 'cat', 'cats', 'chicken', 'chickens', 'duck', 'ducks',
      'goat', 'goats', 'squirrel', 'squirrels', 'crab', 'crabs', 'raccoon',
      'raccoons', 'possum', 'possums', 'sloth', 'sloths', 'cow', 'cows', 'pig',
      'pigs', 'fish', 'bear', 'bears', 'horse', 'horses', 'frog', 'frogs',
      'goose', 'geese', 'llama', 'llamas', 'shark', 'sharks', 'dinosaur',
      'dinosaurs',
    ],
  },
  {
    id: 'food-drink',
    label: 'Food & drink',
    description: 'Titles that name a selected food or non-alcoholic drink motif.',
    terms: [
      'bacon', 'pickle', 'pizza', 'taco', 'ramen', 'potato', 'hot dog',
      'donut', 'banana', 'avocado', 'cheese', 'cereal', 's mores', 'chocolate',
      'coffee',
    ],
  },
  {
    id: 'alcohol',
    label: 'Drinking culture',
    description: 'Titles that mention alcohol or common drinking terms.',
    terms: ['whiskey', 'beer', 'wine', 'cocktail', 'drunk', 'drinking', 'vodka', 'tequila'],
  },
  {
    id: 'pranks',
    label: 'Pranks & gags',
    description: 'Titles that explicitly describe a prank, gag, joke, trick, or fake.',
    terms: ['prank', 'pranks', 'gag', 'gags', 'joke', 'jokes', 'trick', 'tricks', 'fake', 'whoopie', 'shocking'],
  },
  {
    id: 'office',
    label: 'Work & office',
    description: 'Titles that invoke work, desks, meetings, or workplace recipients.',
    terms: ['office', 'coworker', 'coworkers', 'boss', 'meeting', 'meetings', 'desk', 'retirement', 'teacher', 'teachers', 'nurse', 'nurses', 'work'],
  },
  {
    id: 'bathroom',
    label: 'Bathroom humor',
    description: 'Titles that explicitly mention bodily functions or bathroom jokes.',
    terms: [
      'fart', 'farts', 'farting', 'poop', 'poops', 'pooping', 'toilet',
      'toilets', 'butt', 'butts', 'turd', 'turds', 'shart', 'sharts', 'whoopie',
      'bathroom', 'potty',
    ],
  },
  {
    id: 'adult-anatomy',
    label: 'Adult anatomy',
    description: 'Titles that explicitly name selected adult anatomy or gestures.',
    terms: ['penis', 'penises', 'boob', 'boobs', 'testicle', 'testicles', 'balls', 'vagina', 'vaginas', 'nipple', 'nipples', 'middle finger'],
  },
] as const;

export interface WeirdGiftIndexResult {
  version: string;
  publishedAt: string;
  catalogUpdatedAt: string;
  totalProducts: number;
  knownPriceCount: number;
  humorSignalCount: number;
  motifs: Array<{
    id: string;
    label: string;
    description: string;
    terms: readonly string[];
    count: number;
    percentage: number;
  }>;
  titleSignals: Array<{
    term: string;
    count: number;
    percentage: number;
  }>;
  crossovers: {
    animalsWithHumorSignal: number;
    animalsWithBathroomHumor: number;
  };
  sourceCounts: Array<{
    source: string;
    count: number;
  }>;
}

export function normalizeTitle(value: string): string {
  return ` ${value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `;
}

export function titleMatchesAny(title: string, terms: readonly string[]): boolean {
  const normalized = normalizeTitle(title);
  return terms.some((term) => normalized.includes(` ${term} `));
}

function percentage(count: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((count / total) * 1000) / 10;
}

export function analyzeWeirdGiftCatalog(rows: WeirdGiftCatalogRow[]): WeirdGiftIndexResult {
  const totalProducts = rows.length;
  const motifCounts = new Map(
    MOTIF_DEFINITIONS.map((motif) => [
      motif.id,
      rows.filter((row) => titleMatchesAny(row.title, motif.terms)).length,
    ])
  );
  const sourceCountMap = rows.reduce((counts, row) => {
    counts.set(row.source, (counts.get(row.source) || 0) + 1);
    return counts;
  }, new Map<string, number>());
  const updatedTimes = rows
    .map((row) => new Date(row.updatedAt).getTime())
    .filter(Number.isFinite);

  return {
    version: WEIRD_GIFT_INDEX_VERSION,
    publishedAt: WEIRD_GIFT_INDEX_PUBLISHED,
    catalogUpdatedAt: updatedTimes.length > 0
      ? new Date(Math.max(...updatedTimes)).toISOString()
      : WEIRD_GIFT_INDEX_PUBLISHED,
    totalProducts,
    knownPriceCount: rows.filter((row) => Number(row.price) > 0).length,
    humorSignalCount: rows.filter((row) => titleMatchesAny(row.title, HUMOR_SIGNAL_TERMS)).length,
    motifs: MOTIF_DEFINITIONS.map((motif) => {
      const count = motifCounts.get(motif.id) || 0;
      return {
        ...motif,
        count,
        percentage: percentage(count, totalProducts),
      };
    }).sort((a, b) => b.count - a.count),
    titleSignals: TITLE_SIGNAL_TERMS.map((term) => {
      const count = rows.filter((row) => titleMatchesAny(row.title, [term])).length;
      return {
        term,
        count,
        percentage: percentage(count, totalProducts),
      };
    }).sort((a, b) => b.count - a.count),
    crossovers: {
      animalsWithHumorSignal: rows.filter((row) => (
        titleMatchesAny(row.title, MOTIF_DEFINITIONS[0].terms)
        && titleMatchesAny(row.title, HUMOR_SIGNAL_TERMS)
      )).length,
      animalsWithBathroomHumor: rows.filter((row) => (
        titleMatchesAny(row.title, MOTIF_DEFINITIONS[0].terms)
        && titleMatchesAny(row.title, MOTIF_DEFINITIONS[5].terms)
      )).length,
    },
    sourceCounts: [...sourceCountMap.entries()]
      .map(([source, count]) => ({ source, count }))
      .sort((a, b) => b.count - a.count),
  };
}

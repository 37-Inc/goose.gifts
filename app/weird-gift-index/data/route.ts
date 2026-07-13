import { NextResponse } from 'next/server';
import { getWeirdGiftIndex } from '@/lib/weird-gift-index';
import {
  HUMOR_SIGNAL_TERMS,
  MOTIF_DEFINITIONS,
  TITLE_SIGNAL_TERMS,
} from '@/lib/weird-gift-index-analysis';

export async function GET() {
  const index = await getWeirdGiftIndex();

  return NextResponse.json({
    ...index,
    methodology: {
      inclusion: 'Active goose.gifts catalog listings with an image and outbound affiliate URL.',
      analyzedField: 'Original merchant title only.',
      normalization: 'Lowercase; replace punctuation with spaces; match whole words or phrases.',
      categoryRule: 'Categories overlap and should not be summed.',
      interpretation: 'Counts describe catalog inventory, not sales, popularity, demand, or quality.',
      priceLimitation: `Only ${index.knownPriceCount} of ${index.totalProducts} listings have a usable price; no price conclusions are reported.`,
      humorSignalTerms: HUMOR_SIGNAL_TERMS,
      titleSignalTerms: TITLE_SIGNAL_TERMS,
      motifDictionaries: MOTIF_DEFINITIONS,
    },
  }, {
    headers: {
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}

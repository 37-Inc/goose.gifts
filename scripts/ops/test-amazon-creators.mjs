#!/usr/bin/env node

import dotenv from 'dotenv';
import amazonCreators from '../../lib/amazon-creators.js';

dotenv.config({ path: '.env.local', quiet: true });
dotenv.config({ quiet: true });

async function main() {
  if (!amazonCreators.isConfigured()) {
    throw new Error(
      'Missing Amazon Creators API configuration. Required: AMAZON_CREATORS_CREDENTIAL_ID, AMAZON_CREATORS_CREDENTIAL_SECRET, AMAZON_CREATORS_CREDENTIAL_VERSION, AMAZON_ASSOCIATE_TAG.'
    );
  }

  const searchResults = await amazonCreators.searchItems({ keywords: 'funny coffee mug', itemCount: 1 });
  const firstProduct = searchResults[0];
  if (!firstProduct?.id) {
    throw new Error('Amazon Creators SearchItems returned no usable product.');
  }

  const refreshed = await amazonCreators.getItems([firstProduct.id]);
  if (!refreshed.some((product) => product.id === firstProduct.id)) {
    throw new Error('Amazon Creators GetItems did not return the searched ASIN.');
  }

  console.log(JSON.stringify({
    searchItems: searchResults.length,
    getItems: refreshed.length,
    verified: true,
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

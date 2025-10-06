#!/usr/bin/env node
/**
 * Test script to verify Amazon GetItems API
 */

require('dotenv').config({ path: '.env' });
const crypto = require('crypto');

const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID;
const AWS_SECRET_KEY = process.env.AWS_SECRET_KEY;
const AMAZON_ASSOCIATE_TAG = process.env.AMAZON_ASSOCIATE_TAG;

if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_KEY || !AMAZON_ASSOCIATE_TAG) {
  console.error('❌ Missing Amazon credentials');
  process.exit(1);
}

console.log('🔍 Testing Amazon GetItems API...\n');

function createCanonicalRequest(params, timestamp) {
  const payload = JSON.stringify(params);
  const hashedPayload = crypto.createHash('sha256').update(payload).digest('hex');

  return [
    'POST',
    '/paapi5/getitems',
    '',
    'content-type:application/json; charset=utf-8',
    'host:webservices.amazon.com',
    `x-amz-date:${timestamp}`,
    '',
    'content-type;host;x-amz-date',
    hashedPayload,
  ].join('\n');
}

function createSignature(canonicalRequest, timestamp, region) {
  const date = timestamp.split('T')[0];
  const credentialScope = `${date}/${region}/ProductAdvertisingAPI/aws4_request`;

  const stringToSign = [
    'AWS4-HMAC-SHA256',
    timestamp,
    credentialScope,
    crypto.createHash('sha256').update(canonicalRequest).digest('hex'),
  ].join('\n');

  const kDate = crypto.createHmac('sha256', `AWS4${AWS_SECRET_KEY}`).update(date).digest();
  const kRegion = crypto.createHmac('sha256', kDate).update(region).digest();
  const kService = crypto.createHmac('sha256', kRegion).update('ProductAdvertisingAPI').digest();
  const kSigning = crypto.createHmac('sha256', kService).update('aws4_request').digest();

  return crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex');
}

async function testGetItems() {
  const region = 'us-east-1';
  const timestamp = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
  const date = timestamp.split('T')[0];

  const params = {
    PartnerTag: AMAZON_ASSOCIATE_TAG,
    PartnerType: 'Associates',
    ItemIds: ['B083TCZDMT'], // Known ASIN from test-amazon-api.js
    Resources: [
      'Images.Primary.Large',
      'ItemInfo.Title',
      'Offers.Listings.Price',
    ],
  };

  const canonicalRequest = createCanonicalRequest(params, timestamp);
  const signature = createSignature(canonicalRequest, timestamp, region);
  const credentialScope = `${date}/${region}/ProductAdvertisingAPI/aws4_request`;

  try {
    console.log('📡 Making GetItems request...\n');

    const response = await fetch('https://webservices.amazon.com/paapi5/getitems', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'X-Amz-Date': timestamp,
        'Authorization': `AWS4-HMAC-SHA256 Credential=${AWS_ACCESS_KEY_ID}/${credentialScope}, SignedHeaders=content-type;host;x-amz-date, Signature=${signature}`,
        'Host': 'webservices.amazon.com',
      },
      body: JSON.stringify(params),
    });

    const data = await response.json();

    if (response.ok && data.ItemsResult?.Items) {
      console.log('✅ SUCCESS! GetItems API works.\n');
      console.log('Retrieved:', data.ItemsResult.Items.length, 'item(s)');

      const item = data.ItemsResult.Items[0];
      console.log('\nProduct details:');
      console.log('  ASIN:', item.ASIN);
      console.log('  Title:', item.ItemInfo?.Title?.DisplayValue);
      console.log('  Price:', item.Offers?.Listings?.[0]?.Price?.DisplayAmount);

      return true;
    } else {
      console.error('❌ FAILED!');
      console.error('Status:', response.status);
      console.error('Response:', JSON.stringify(data, null, 2));
      return false;
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    return false;
  }
}

testGetItems()
  .then(success => process.exit(success ? 0 : 1))
  .catch(err => {
    console.error('Unexpected error:', err);
    process.exit(1);
  });

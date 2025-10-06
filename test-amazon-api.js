#!/usr/bin/env node
/**
 * Test script to verify Amazon Product Advertising API credentials
 *
 * Run with: node test-amazon-api.js
 */

require('dotenv').config({ path: '.env' });
const crypto = require('crypto');

const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID;
const AWS_SECRET_KEY = process.env.AWS_SECRET_KEY;
const AMAZON_ASSOCIATE_TAG = process.env.AMAZON_ASSOCIATE_TAG;

// Check if credentials are configured
if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_KEY || !AMAZON_ASSOCIATE_TAG) {
  console.error('❌ Missing Amazon credentials in .env file');
  console.error('Required: AWS_ACCESS_KEY_ID, AWS_SECRET_KEY, AMAZON_ASSOCIATE_TAG');
  process.exit(1);
}

console.log('🔍 Testing Amazon Product Advertising API credentials...\n');
console.log('Access Key ID:', AWS_ACCESS_KEY_ID.substring(0, 8) + '...');
console.log('Associate Tag:', AMAZON_ASSOCIATE_TAG);
console.log('');

// AWS4 Signing functions
function createCanonicalRequest(params, timestamp) {
  const payload = JSON.stringify(params);
  const hashedPayload = crypto.createHash('sha256').update(payload).digest('hex');

  return [
    'POST',
    '/paapi5/searchitems',
    '',
    'content-encoding:amz-1.0',
    'content-type:application/json; charset=utf-8',
    `host:webservices.amazon.com`,
    `x-amz-date:${timestamp}`,
    `x-amz-target:com.amazon.paapi5.v1.ProductAdvertisingAPIv1.SearchItems`,
    '',
    'content-encoding;content-type;host;x-amz-date;x-amz-target',
    hashedPayload,
  ].join('\n');
}

function createStringToSign(canonicalRequest, timestamp, region) {
  const date = timestamp.substring(0, 8);
  const credentialScope = `${date}/${region}/ProductAdvertisingAPI/aws4_request`;

  const hashedRequest = crypto.createHash('sha256').update(canonicalRequest).digest('hex');

  return [
    'AWS4-HMAC-SHA256',
    timestamp,
    credentialScope,
    hashedRequest,
  ].join('\n');
}

function calculateSignature(stringToSign, timestamp, region) {
  const date = timestamp.substring(0, 8);

  const kDate = crypto.createHmac('sha256', `AWS4${AWS_SECRET_KEY}`).update(date).digest();
  const kRegion = crypto.createHmac('sha256', kDate).update(region).digest();
  const kService = crypto.createHmac('sha256', kRegion).update('ProductAdvertisingAPI').digest();
  const kSigning = crypto.createHmac('sha256', kService).update('aws4_request').digest();

  return crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex');
}

async function testAmazonSearch() {
  const region = 'us-east-1';
  const timestamp = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
  const date = timestamp.substring(0, 8);

  const params = {
    PartnerTag: AMAZON_ASSOCIATE_TAG,
    PartnerType: 'Associates',
    Keywords: 'coffee mug',
    SearchIndex: 'All',
    ItemCount: 1,
    Resources: [
      'Images.Primary.Large',
      'ItemInfo.Title',
      'Offers.Listings.Price',
    ],
  };

  const canonicalRequest = createCanonicalRequest(params, timestamp);
  const stringToSign = createStringToSign(canonicalRequest, timestamp, region);
  const signature = calculateSignature(stringToSign, timestamp, region);

  const credentialScope = `${date}/${region}/ProductAdvertisingAPI/aws4_request`;
  const authHeader = [
    `AWS4-HMAC-SHA256 Credential=${AWS_ACCESS_KEY_ID}/${credentialScope}`,
    'SignedHeaders=content-encoding;content-type;host;x-amz-date;x-amz-target',
    `Signature=${signature}`,
  ].join(', ');

  try {
    console.log('📡 Making test request to Amazon PA-API...\n');

    const response = await fetch('https://webservices.amazon.com/paapi5/searchitems', {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Encoding': 'amz-1.0',
        'Host': 'webservices.amazon.com',
        'X-Amz-Date': timestamp,
        'X-Amz-Target': 'com.amazon.paapi5.v1.ProductAdvertisingAPIv1.SearchItems',
      },
      body: JSON.stringify(params),
    });

    const data = await response.json();

    if (response.ok && data.SearchResult?.Items) {
      console.log('✅ SUCCESS! Amazon credentials are valid.\n');
      console.log('Test search for "coffee mug" returned:', data.SearchResult.Items.length, 'result(s)');

      if (data.SearchResult.Items[0]) {
        const item = data.SearchResult.Items[0];
        console.log('\nSample product:');
        console.log('  Title:', item.ItemInfo?.Title?.DisplayValue || 'N/A');
        console.log('  ASIN:', item.ASIN);
        console.log('  Price:', item.Offers?.Listings?.[0]?.Price?.DisplayAmount || 'N/A');
      }

      console.log('\n✨ Your Amazon PA-API credentials are working correctly!');
      return true;
    } else {
      console.error('❌ FAILED! API returned an error.\n');
      console.error('Status:', response.status, response.statusText);
      console.error('Response:', JSON.stringify(data, null, 2));

      if (data.__type?.includes('InvalidPartnerTag')) {
        console.error('\n💡 The Associate Tag (AMAZON_ASSOCIATE_TAG) appears to be invalid.');
      } else if (data.__type?.includes('InvalidSignature')) {
        console.error('\n💡 The AWS credentials (AWS_ACCESS_KEY_ID or AWS_SECRET_KEY) appear to be invalid.');
      } else if (data.__type?.includes('TooManyRequests')) {
        console.error('\n💡 Rate limit exceeded (1 request per second limit).');
      }

      return false;
    }
  } catch (error) {
    console.error('❌ Network or request error:', error.message);
    return false;
  }
}

// Run the test
testAmazonSearch()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(err => {
    console.error('Unexpected error:', err);
    process.exit(1);
  });

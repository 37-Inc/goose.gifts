# Google Custom Search API Setup

This guide shows you how to set up Google Custom Search as an alternative to Amazon PA-API for product searching.

## Why Use Google Search?

**Pros:**
- ✅ No complex rate limits (100 free queries/day, $5/1k after that)
- ✅ No account restrictions or revenue requirements
- ✅ Instant setup (no waiting for API approval)
- ✅ Can search any site (amazon.com, etsy.com, etc.)
- ✅ Returns product links, titles, descriptions, and images

**Cons:**
- ⚠️ 100 free queries/day limit (vs 8,640 for Amazon PA-API)
- ⚠️ Price extraction less reliable (scraped from page metadata)
- ⚠️ Not official Amazon API (could change)

## Setup Steps

### Step 1: Create a Programmable Search Engine

1. Go to: https://programmablesearchengine.google.com/controlpanel/all
2. Click **"Add"** to create a new search engine
3. Configure:
   - **Name**: "Amazon Product Search"
   - **What to search**: Select "Search specific sites or pages"
   - **Sites to search**: Enter `amazon.com`
   - **Search settings**: Enable "Image search" and "SafeSearch"
4. Click **"Create"**
5. Copy your **Search engine ID** (looks like: `a1b2c3d4e5f6g7h8i`)

### Step 2: Get an API Key

1. Go to: https://console.cloud.google.com/apis/credentials
2. Create a new project (or select existing)
3. Click **"+ CREATE CREDENTIALS"** → **"API key"**
4. Copy your API key (looks like: `AIzaSyA...`)
5. **Restrict the API key** (recommended):
   - Click "Edit API key"
   - Under "API restrictions", select "Restrict key"
   - Choose "Custom Search API"
   - Save

### Step 3: Enable Custom Search API

1. Go to: https://console.cloud.google.com/apis/library/customsearch.googleapis.com
2. Click **"Enable"**
3. Wait for API to be enabled

### Step 4: Add to Environment Variables

**Local Development** (`.env`):
```bash
GOOGLE_SEARCH_API_KEY=AIzaSyA...your_key_here
GOOGLE_SEARCH_ENGINE_ID=a1b2c3d4e5f6g7h8i
USE_GOOGLE_AMAZON_SEARCH=true
```

**Production** (Vercel):
```bash
vercel env add GOOGLE_SEARCH_API_KEY
# Paste your API key

vercel env add GOOGLE_SEARCH_ENGINE_ID
# Paste your search engine ID

vercel env add USE_GOOGLE_AMAZON_SEARCH
# Enter: true
```

### Step 5: Optional - Enable "Best Seller" Mode

To prefix all searches with "best seller" for better results:

```bash
GOOGLE_SEARCH_BEST_SELLER=true
```

This searches for "best seller golf balls" instead of just "golf balls".

## Testing

Once configured, try a search. You should see in logs:
```
🔧 Search mode: GOOGLE | LITE
🔍 Google searching Amazon for: "golf balls"
✅ Found 10 Amazon products via Google
```

## Rate Limits & Costs

### Free Tier
- **100 queries/day** at no cost
- Resets daily at midnight Pacific Time
- Sufficient for ~25 gift searches per day (4 queries each)

### Paid Tier
- **$5 per 1,000 queries**
- Up to 10,000 queries/day max
- Bill through Google Cloud Platform

### Monitoring Usage
1. Go to: https://console.cloud.google.com/apis/dashboard
2. Select "Custom Search JSON API"
3. View daily usage and quota

## Troubleshooting

### "API key not valid"
- Verify API key is correct
- Check API restrictions allow Custom Search JSON API
- Ensure billing is enabled (for paid tier)

### "Search engine ID not found"
- Verify search engine ID from control panel
- Check search engine status is "Active"

### No results returned
- Check search engine is configured to search `amazon.com`
- Try test query in Programmable Search Engine control panel
- Verify "siteSearch" parameter in API call

### Price extraction issues
- Google Search doesn't always return prices
- Falls back to scraping snippet text
- Some products may show $0 (filtered out automatically)

## Comparison: Google vs Amazon PA-API

| Feature | Google Custom Search | Amazon PA-API |
|---------|---------------------|---------------|
| Free tier | 100 queries/day | 8,640 queries/day |
| Rate limit | None (just quota) | 1 request/second (new accounts) |
| Setup time | 5 minutes | 24-48 hours |
| Requirements | Google account | Amazon Associates account + sales |
| Price accuracy | Moderate | High |
| Product data | Basic | Comprehensive |
| Affiliate links | Manual | Automatic |
| Best for | MVP, Testing | Production, Scale |

## Recommendation

**Use Google Search if:**
- You're getting PA-API rate limit errors
- You want to test the app before Amazon approval
- You need <100 searches per day

**Use Amazon PA-API if:**
- You have approved PA-API access
- You need >100 searches per day
- You want accurate pricing and product data

You can toggle between them anytime with the `USE_GOOGLE_AMAZON_SEARCH` env variable!

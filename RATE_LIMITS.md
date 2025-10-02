# API Rate Limits & Search Modes

## Current Setup: LITE Mode (Default)

Your app is configured for Amazon PA-API's **new account limits** (1 request per second).

### LITE Mode Performance:
- ✅ **Speed**: ~6-10 seconds per gift search
- ✅ **Rate Limit Safe**: 1 Amazon API call per concept
- ⚠️ **Product Variety**: Searches only 1 category + 1 query per concept

### How LITE Mode Works:
1. Generates 4 gift concepts
2. For each concept, searches only the **first product query**
3. Searches only **'All' category** on Amazon
4. Adds 1.5s delay between concepts
5. Returns 2-4 products per concept

---

## Future: FULL Mode (When Rate Limits Increase)

Once you have higher API limits (usually after making sales), enable FULL mode for better results.

### FULL Mode Performance:
- 🚀 **Product Variety**: 5 categories + all queries per concept
- 📦 **Better Matching**: Searches 3-4 product queries per concept
- ⏱️ **Slower**: ~45-60 seconds per gift search
- ⚠️ **Requires**: Higher rate limits (~10 req/sec or throttling)

### How FULL Mode Works:
1. Generates 4 gift concepts
2. For each concept, searches **all 3-4 product queries**
3. Each query searches **5 categories**: All, ToysAndGames, HomeAndKitchen, OfficeProducts, ArtsAndCrafts
4. Adds 1.5s delay between API calls
5. Returns 2-4 products per concept

---

## How to Switch to FULL Mode

### Step 1: Check Your API Limits
Amazon increases limits after you:
- Make 3+ qualified sales (required within 180 days)
- Maintain good standing for a few months
- Request limit increase via AWS support

### Step 2: Enable FULL Mode
In your `.env` file, uncomment and set:
```bash
ENABLE_FULL_SEARCH=true
```

In Vercel (production):
```bash
vercel env add ENABLE_FULL_SEARCH
# Enter: true
```

### Step 3: Test
Try a search - you should see in logs:
```
🔍 Search mode: FULL (5 categories)
📦 Searching 3/3 queries for "Gift Title"
```

---

## API Call Comparison

### LITE Mode (Current):
- **4 concepts** × **1 query** × **1 category** = **4 Amazon API calls**
- Plus Etsy calls (independent rate limits)
- Total time: ~6-10 seconds

### FULL Mode (Future):
- **4 concepts** × **3 queries avg** × **5 categories** = **60 Amazon API calls**
- Plus Etsy calls (independent rate limits)
- Total time: ~45-60 seconds (with 1.5s delays)

---

## Rate Limit Errors

If you see:
```
TooManyRequestsException: request throttling
```

**Solution**: Switch back to LITE mode or reduce concurrent searches.

---

## Cost Considerations

- Amazon PA-API: **FREE** (no per-request charges)
- OpenAI API: **~$0.02-0.05 per search** (GPT-4 concept generation)
- Etsy API: **FREE** (10,000 requests/day)

Main cost is OpenAI - product searches are free!

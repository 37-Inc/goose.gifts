# Search Analytics Feature

## Overview

Search analytics system for tracking, analyzing, and improving product-catalog search on goose.gifts. This system helps identify catalog gaps, measure search effectiveness, and understand user behavior.

## 🎯 Features Implemented

### 1. Database Tracking
- **Table**: `search_queries`
- **Tracked Data**:
  - Search query text
  - Result count
  - Top similarity score (best match quality)
  - Click-through (did user click a result?)
  - Click-through flag
  - User agent
  - Timestamp

### 2. Google Analytics Integration

GA4 browser tagging is installed in `app/layout.tsx` with measurement ID
`G-6RR3HPR747`, and Google Ads tagging is installed with `AW-17626116539`.
The matching GA4 property is `507421709`. The dedicated goose service account
has Viewer access, so Codex can read GA4 through `npm run analytics:ga4 -- ...`
without using the browser.

- **Search Event**: Fires on every catalog search with:
  - `event`: `'search'`
  - `search_term`: The query
  - `event_category`: `'catalog_search'`
  - `event_label`: Product result count

- **Click Event**: Fires when user clicks a catalog product:
  - `event`: `'conversion_event_outbound_click'`
  - `event_category`: `'catalog_product'`
  - `link_domain`: Affiliate destination domain

### 3. Admin Dashboard

Located at: `/admin/search-analytics`

#### Summary Metrics (by Day/Week/Month)
- **Total Searches**: Volume of search activity
- **Unique Queries**: Distinct search terms
- **Avg Results/Search**: How many results per search
- **Click-Through Rate**: % of searches that lead to clicks
- **Zero Result Rate**: % of searches with no results (catalog gaps)

#### Top Search Terms
- Most popular queries
- Search count
- Average results
- Click-through rate
- Color-coded CTR (green >20%, yellow >10%, red <10%)

#### Failed Searches (Catalog Gaps)
- Queries returning 0 results
- Frequency count
- Last searched timestamp
- **Action**: Add these queries to catalog discovery themes.

#### Poor Result Quality
- Queries with low similarity scores (<0.6)
- May indicate semantic mismatch
- **Action**: Enrich or discover better products for those intents.

#### Recent Searches
- Last 50 searches
- Real-time debugging view
- Shows query, results, similarity, clicked status

## 📊 Data Flow

```
User searches -> CatalogSearchFeed component
                ↓
    Google Analytics event fired
                ↓
    API: /api/search-products
                ↓
    Database: Log to search_queries table
                ↓
    Return product results to user
                ↓
    User clicks product -> track-click updates product + search row
                         -> GA conversion event fired
                         -> affiliate link opens in new tab
```

## 🗄️ Database Schema

```sql
CREATE TABLE "search_queries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "query" text NOT NULL,
  "result_count" integer DEFAULT 0 NOT NULL,
  "top_similarity" numeric(5, 4),
  "clicked" integer DEFAULT 0 NOT NULL,
  "session_id" varchar(100),
  "user_agent" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);

-- Indexes for fast queries
CREATE INDEX "search_queries_created_at_idx" ON "search_queries" USING btree ("created_at");
CREATE INDEX "search_queries_result_count_idx" ON "search_queries" USING btree ("result_count");
CREATE INDEX "search_queries_clicked_idx" ON "search_queries" USING btree ("clicked");
CREATE INDEX "search_queries_query_created_at_idx" ON "search_queries" USING btree ("query","created_at");
```

## 🚀 Deployment Instructions

### 1. Run Database Migration

**Option A: Using drizzle-kit**
```bash
npx drizzle-kit push
```

**Option B: Direct SQL (recommended for production)**
```bash
# Connect to production database
psql $POSTGRES_URL

# Run migration
\i lib/db/migrations/0002_add_search_queries.sql
```

### 2. Verify Migration
```bash
# Check table exists
psql $POSTGRES_URL -c "\d search_queries"

# Check indexes
psql $POSTGRES_URL -c "\d search_queries_created_at_idx"
```

### 3. Test Locally
```bash
npm run dev
```
- Visit http://localhost:3000
- Try searching for various terms
- Check admin at http://localhost:3000/admin/search-analytics

### 4. Deploy to Production
```bash
git add .
git commit -m "Add search analytics tracking system"
git push origin main
```

## 📈 Using the Analytics

### Daily Workflow
1. Visit `/admin/search-analytics?period=day`
2. Check **Failed Searches** section
3. Identify high-frequency zero-result queries
4. Add those topics to catalog discovery themes or run targeted prefetch
5. Re-check CTR and zero-result rate

### Weekly Review
1. View `/admin/search-analytics?period=week`
2. Analyze **Top Search Terms**
3. Prioritize catalog discovery for high-volume, low-CTR queries
4. Review **Poor Result Quality** for enrichment and embedding improvements

### Monthly Analysis
1. View `/admin/search-analytics?period=month`
2. Track overall search volume trend
3. Measure improvement in zero-result rate over time
4. Compare CTR month-over-month

## 🎓 Key Insights to Track

### Catalog Gaps (Priority #1)
- **Metric**: Failed Searches with count > 5
- **Action**: Add products for these queries immediately
- **Impact**: Convert lost searches into engaged users

### Search Effectiveness
- **Metric**: Overall Click-Through Rate
- **Target**: >25% CTR
- **If Low**: Improve product titles/descriptions and catalog coverage

### Search Volume
- **Metric**: Total searches per day
- **Trend**: Should grow with traffic
- **If Low**: Search bar may not be visible enough

### Result Quality
- **Metric**: Average similarity score
- **Target**: >0.7
- **If Low**: Improve embedding quality or product descriptions

## 🔧 Troubleshooting

### No data showing up
- Check migration ran successfully: `psql $POSTGRES_URL -c "SELECT COUNT(*) FROM search_queries"`
- Verify search bar is visible and functional
- Check browser console for API errors

### Google Analytics not tracking
- Verify gtag is loaded: Check browser console for `window.gtag`
- Check GA dashboard real-time events
- Confirm the hardcoded GA4 measurement ID in `app/layout.tsx` is still the
  intended goose.gifts property: `G-6RR3HPR747`.
- For programmatic GA reports, run `npm run analytics:ga4 -- events`,
  `npm run analytics:ga4 -- traffic`, `npm run analytics:ga4 -- landing-pages`,
  or `npm run analytics:ga4 -- event conversion_event_outbound_click`.

### Poor similarity scores
- Review product copy - is it semantic and descriptive?
- Check product embedding generation in `scripts/ops/prefetch-catalog.mjs`
- Run `npm run catalog:enrich` to backfill existing active products

## 📝 Files Modified

### New Files
- `lib/db/migrations/0002_add_search_queries.sql` - Database migration
- `lib/db/search-analytics.ts` - Analytics query functions
- `app/admin/(dashboard)/search-analytics/page.tsx` - Admin UI
- `docs/SEARCH_ANALYTICS.md` - This documentation

### Modified Files
- `lib/db/schema.ts` - Added searchQueries table
- `app/api/search-products/route.ts` - Product search logging
- `components/CatalogSearchFeed.tsx` - Catalog search UI and GA search event
- `components/ProductGrid.tsx` - Product click and impression tracking
- `app/admin/(dashboard)/page.tsx` - Added quick link

## 🎉 Success Metrics

After 1 week, you should see:
- ✅ 90%+ of searches logged to database
- ✅ GA events showing in real-time view
- ✅ Admin dashboard showing clear trends
- ✅ Identified top 10 catalog gaps
- ✅ Baseline CTR established

After 1 month:
- ✅ Zero-result rate decreased by >50%
- ✅ CTR improved by >10 percentage points
- ✅ Search volume increased with traffic growth
- ✅ Added or enriched products based on search demand

## 🚨 Important Notes

- Search logging is **fire-and-forget** - won't slow down searches
- Database is indexed for fast queries even with millions of searches
- GA events use standard Google Analytics 4 event names
- All times are stored in UTC in database
- Click tracking works even though results open in new tab

---

**Questions?** Check the code comments or search for `searchQueries` in the codebase.

**Ready to deploy?** Run the migration and push to main.

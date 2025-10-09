# 🚀 Quick Start: Search Analytics

## Deploy in 3 Steps

### 1️⃣ Run Migration (2 minutes)
```bash
npx drizzle-kit push
```

### 2️⃣ Verify (30 seconds)
```bash
psql $POSTGRES_URL -c "SELECT COUNT(*) FROM search_queries"
# Should return: 0 rows (empty table, ready to go)
```

### 3️⃣ Deploy (1 minute)
```bash
git add .
git commit -m "Add search analytics tracking"
git push origin main
```

---

## Access the Dashboard

**URL**: https://goose.gifts/admin/search-analytics

Or click "Search Analytics" from the main admin dashboard

---

## What You Get

### 📊 5 Key Metrics
1. **Total Searches** - Volume
2. **Unique Queries** - Variety
3. **Avg Results** - Quality
4. **Click Rate** - Engagement
5. **Zero Results** - Content Gaps

### 📋 4 Main Reports
1. **Top Search Terms** - What's popular
2. **Failed Searches** - What to build next
3. **Poor Results** - What to improve
4. **Recent Activity** - Real-time monitoring

### 📅 3 Time Periods
- Last 24 Hours
- Last 7 Days
- Last 30 Days

---

## Daily Workflow (5 min)

1. Go to `/admin/search-analytics?period=day`
2. Scroll to "Failed Searches"
3. Pick top 2-3 queries with 0 results
4. Create bundles for those
5. Done! 🎉

---

## Files to Know

**Admin Dashboard**
- `app/admin/(dashboard)/search-analytics/page.tsx`

**Analytics Queries**
- `lib/db/search-analytics.ts`

**Database Schema**
- `lib/db/schema.ts` (search searchQueries table)

**Migration**
- `lib/db/migrations/0002_add_search_queries.sql`

**Full Documentation**
- `docs/SEARCH_ANALYTICS.md`

---

## Troubleshooting

**No data showing?**
- Check migration ran: `psql $POSTGRES_URL -c "\d search_queries"`
- Try a search on homepage
- Refresh admin dashboard

**Build errors?**
- Run `npm run build` - should pass ✅
- All TypeScript types are correct

**GA not tracking?**
- Check browser console: `window.gtag` should exist
- View GA real-time events
- Event names: `search` and `select_content`

---

## Success! 🎉

Everything is ready to go. Just run the migration and push to main!

Questions? Check `SEARCH_ANALYTICS_SUMMARY.md` or `docs/SEARCH_ANALYTICS.md`

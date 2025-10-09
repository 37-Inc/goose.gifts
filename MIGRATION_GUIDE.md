# Database Schema Migration Guide

## Overview

This migration refactors the database from storing gift ideas and products in a JSONB column to a fully relational structure with separate tables for `products`, `gift_ideas`, and `gift_idea_products`.

## Benefits

1. **Product Deduplication**: Same products across multiple bundles are stored once, saving storage space
2. **Better Performance**: Indexed queries replace JSON parsing
3. **Data Integrity**: Foreign key constraints ensure referential integrity
4. **Flexibility**: Easier to query, update, and analyze product data
5. **Future Features**: Enables product analytics, commission tracking, and product-level optimizations

## New Schema

### Tables Created

#### `products` - Deduplicated product catalog
- `id` (varchar, PK) - ASIN or Etsy listing ID
- `title` (text)
- `price` (numeric)
- `currency` (varchar, default 'USD')
- `image_url` (text)
- `affiliate_url` (text)
- `source` (varchar) - 'amazon' or 'etsy'
- `rating` (numeric)
- `review_count` (integer)
- `category` (varchar) - For future commission tracking
- `created_at`, `updated_at` (timestamps)

**Indexes**: `source`

#### `gift_ideas` - Gift idea metadata
- `id` (uuid, PK)
- `bundle_id` (uuid, FK to gift_bundles, CASCADE)
- `title` (text)
- `tagline` (text)
- `description` (text)
- `position` (integer) - Order within bundle
- `created_at` (timestamp)

**Indexes**: `bundle_id`, `(bundle_id, position)`

#### `gift_idea_products` - Junction table
- `id` (uuid, PK)
- `gift_idea_id` (uuid, FK to gift_ideas, CASCADE)
- `product_id` (varchar, FK to products, CASCADE)
- `position` (integer) - Order within gift idea
- `created_at` (timestamp)

**Indexes**: `gift_idea_id`, `product_id`, `(gift_idea_id, position)`

### Table Modified

#### `gift_bundles`
- **Removed**: `giftIdeas` JSONB column (will be dropped after migration verification)
- All other columns remain unchanged

## Migration Steps

### 1. Run SQL Migration

First, create the new tables:

```bash
# Apply the SQL migration
psql $POSTGRES_URL < lib/db/migrations/0001_add_relational_products.sql
```

Or use Drizzle Kit:

```bash
npx drizzle-kit push
```

### 2. Run Data Migration

Migrate existing JSONB data to relational tables:

```bash
# Run the data migration script
npx tsx lib/db/migrate-data.ts
```

The script will:
- Extract all gift ideas from `gift_bundles.gift_ideas`
- Create deduplicated `products` records
- Create `gift_ideas` records for each bundle
- Create `gift_idea_products` junction entries
- Preserve position/ordering
- Provide detailed statistics

**Important**: The script does NOT drop the `gift_ideas` JSONB column. This allows for rollback if needed.

### 3. Verify Migration

Test that everything works:

```bash
# Run the application
npm run dev

# Test key functionality:
# 1. View existing bundles
# 2. Create new bundle
# 3. Edit bundle products in admin panel
# 4. Check related bundles display correctly
```

### 4. Drop Old Column (Optional)

After verifying everything works for at least 24-48 hours:

```sql
ALTER TABLE gift_bundles DROP COLUMN gift_ideas;
```

## Code Changes Summary

### Modified Files

#### Schema (`lib/db/schema.ts`)
- Added `products`, `gift_ideas`, `gift_idea_products` tables
- Added Drizzle relations
- Removed `giftIdeas` JSONB column from bundle schema

#### Operations (`lib/db/operations.ts`)
- **`saveGiftIdeas()`**: Now creates relational records with transactions
- **`getGiftBundleBySlug()`**: Uses JOINs to reconstruct nested structure
- **`updateBundleGiftIdeas()`**: New function for updating gift ideas
- **`getAllBundles()`**: Fetches bundles with nested gift ideas

#### Related Bundles (`lib/db/related-bundles.ts`)
- All functions now return bundles with minimal nested data (first product only)
- Optimized to fetch only what's needed for preview cards

#### API Routes
- **`/api/admin/bundles/[slug]`**: Updated PATCH to use `updateBundleGiftIdeas()`
- **`/api/generate-gift/route.ts`**: No changes needed (already using operations)

#### Admin Panel
- **`app/admin/(dashboard)/bundles/[slug]/page.tsx`**: Updated types to expect nested structure
- **`app/admin/(dashboard)/bundles/page.tsx`**: Uses SEO title instead of gift ideas

#### Components
- **`components/RecentBundles.tsx`**: Updated types to expect bundles with gift ideas

## Data Integrity

### Cascade Deletes
When a bundle is deleted (soft delete):
- Related `gift_ideas` are CASCADE deleted
- Related `gift_idea_products` are CASCADE deleted
- `products` remain (may be used by other bundles)

### Deduplication
Products are deduplicated by ID (ASIN/listing ID):
- Same product in multiple bundles = one `products` record
- Updates to product data (price, rating) affect all references
- ON CONFLICT DO UPDATE ensures latest data is preserved

### Transactions
All multi-table operations use transactions:
- Creating bundles
- Updating gift ideas
- Data migration

## Performance Considerations

### Optimizations
- Indexed foreign keys for fast JOINs
- Position columns for ordered queries
- Minimal data fetching for preview cards (first product only)

### N+1 Query Prevention
Functions like `getAllBundles()` use Promise.all() to prevent N+1 queries when fetching gift ideas for multiple bundles.

## Rollback Plan

If issues arise:

1. **Keep the JSONB column** until fully verified
2. **Revert code**: `git checkout main` (before migration)
3. **Drop new tables**:
```sql
DROP TABLE gift_idea_products CASCADE;
DROP TABLE gift_ideas CASCADE;
DROP TABLE products CASCADE;
```

## Testing Checklist

- [x] Build succeeds (`npm run build`)
- [ ] Migration script runs without errors
- [ ] Existing bundles display correctly
- [ ] New bundles can be created
- [ ] Admin panel can edit products
- [ ] Product reordering works
- [ ] Product deletion works
- [ ] Related bundles display correctly
- [ ] Permalink pages work
- [ ] Product deduplication works (same ASIN = one record)
- [ ] Cascade deletes work (delete bundle → deletes ideas)

## Statistics

After migration, check:
- Number of bundles processed
- Number of unique products vs total products
- Product reuse rate (deduplication efficiency)
- Database size comparison (before/after)

## Support

For issues or questions:
1. Check logs from migration script
2. Verify foreign key constraints
3. Check transaction rollback logs
4. Review git diff for code changes

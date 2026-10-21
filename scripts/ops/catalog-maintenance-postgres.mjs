/** PostgreSQL persistence only. No provider selection, scheduling, or D1 activation.
 * CatalogMaintenanceStore methods accept existing runner values; policy and
 * normalization remain in prefetch-catalog. Query injection is for offline tests.
 */
let driver;
async function defaultQuery(...args) {
  const { sql } = await (driver ??= import('@vercel/postgres'));
  return sql.query(...args);
}

/** Explicit semantic methods; the default driver is bound only on first query. */
export function createPostgresCatalogMaintenanceStore({ query = defaultQuery } = {}) {
  if (typeof query !== 'function') throw new TypeError('Maintenance query must be a function');
  return Object.freeze({
    upsertProduct: (product, sourceHash) => upsertProduct(query, product, sourceHash),
    getActiveCatalogIdentities: (options) => getActiveCatalogIdentities(query, options),
    getExistingEditorialWriteups: (excludedIds) => getExistingEditorialWriteups(query, excludedIds),
    getAffiliateUrlMismatches: (tag) => getAffiliateUrlMismatches(query, tag),
    updateAmazonAffiliateUrl: (id, url) => updateAmazonAffiliateUrl(query, id, url),
    getProductsForRevalidation: (selection) => selection.daily
      ? getDailyRefreshProducts(query, selection) : getProductsForRevalidation(query, selection),
    deactivateConfirmedMissing: (ids, days) => deactivateConfirmedMissing(query, ids, days),
    markConfirmedMissingUnavailable: (ids) => markConfirmedMissingUnavailable(query, ids),
    getProductsNeedingEnrichment: (limit, ids) => getProductsNeedingEnrichment(query, limit, ids),
    recordEditorialEvent: (event) => recordEditorialEvent(query, event),
    markCatalogDuplicate: (id, winner, reason) => markCatalogDuplicate(query, id, winner, reason),
  });
}

/** @typedef {ReturnType<typeof createPostgresCatalogMaintenanceStore>} CatalogMaintenanceStore */

function toPostgresTextArray(values) {
  return `{${values
    .map((value) => `"${String(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`)
    .join(',')}}`;
}

function toPostgresVector(value) {
  if (!Array.isArray(value) || value.length === 0) {
    return null;
  }

  return `[${value.join(',')}]`;
}

async function upsertProduct(query, product, currentSourceHash) {
  const result = await query(
    `
      INSERT INTO products (
        id,
        title,
        price,
        currency,
        image_url,
        affiliate_url,
        source,
        source_query,
        humor_tags,
        punny_title,
        witty_description,
        quality_score,
        rating,
        review_count,
        is_active,
        embedding,
        editorial_writeup,
        source_facts,
        source_facts_hash,
        editorial_source_hash,
        availability_status,
        availability_checked_at,
        editorial_status,
        editorial_quality_score,
        editorial_model,
        editorial_prompt_version,
        editorial_generated_at,
        editorial_block_reason,
        duplicate_of_product_id,
        content_updated_at,
        last_verified_at,
        updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9::text[], $10, $11, $12, $13, $14, $15, $16::vector,
        $18, $19::jsonb, $20, $21, $22, CASE WHEN $17 THEN NOW() ELSE NULL END, $23::text, $24, $25, $26, $27, $28, $29,
        CASE WHEN $23::text IN ('generated_ready', 'manual_locked') THEN NOW() ELSE NULL END,
        CASE WHEN $17 THEN NOW() ELSE NULL END,
        NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title,
        price = EXCLUDED.price,
        currency = EXCLUDED.currency,
        image_url = EXCLUDED.image_url,
        affiliate_url = EXCLUDED.affiliate_url,
        source = EXCLUDED.source,
        source_query = EXCLUDED.source_query,
        humor_tags = EXCLUDED.humor_tags,
        punny_title = COALESCE(EXCLUDED.punny_title, products.punny_title),
        witty_description = COALESCE(EXCLUDED.witty_description, products.witty_description),
        quality_score = EXCLUDED.quality_score,
        rating = EXCLUDED.rating,
        review_count = EXCLUDED.review_count,
        is_active = EXCLUDED.is_active,
        embedding = COALESCE(EXCLUDED.embedding, products.embedding),
        source_facts = COALESCE(EXCLUDED.source_facts, products.source_facts),
        source_facts_hash = COALESCE(EXCLUDED.source_facts_hash, products.source_facts_hash),
        availability_status = COALESCE(EXCLUDED.availability_status, products.availability_status),
        availability_checked_at = COALESCE(EXCLUDED.availability_checked_at, products.availability_checked_at),
        editorial_writeup = CASE
          WHEN products.editorial_status = 'manual_locked' THEN products.editorial_writeup
          WHEN EXCLUDED.editorial_status = 'generated_ready'
            AND EXCLUDED.editorial_writeup IS NOT NULL THEN EXCLUDED.editorial_writeup
          WHEN products.editorial_status IN ('generated_ready', 'stale')
            THEN products.editorial_writeup
          WHEN EXCLUDED.editorial_status IN ('pending', 'needs_review')
            AND EXCLUDED.editorial_writeup IS NOT NULL THEN EXCLUDED.editorial_writeup
          ELSE products.editorial_writeup
        END,
        editorial_source_hash = CASE
          WHEN products.editorial_status = 'manual_locked'
            THEN COALESCE(products.editorial_source_hash, EXCLUDED.editorial_source_hash)
          WHEN EXCLUDED.editorial_status = 'generated_ready'
            THEN EXCLUDED.editorial_source_hash
          WHEN products.editorial_status IN ('generated_ready', 'stale')
            THEN products.editorial_source_hash
          WHEN EXCLUDED.editorial_status IN ('pending', 'needs_review')
            THEN EXCLUDED.editorial_source_hash
          ELSE products.editorial_source_hash
        END,
        editorial_status = CASE
          WHEN products.editorial_status = 'manual_locked' THEN products.editorial_status
          WHEN EXCLUDED.editorial_status = 'generated_ready'
            THEN EXCLUDED.editorial_status
          WHEN products.editorial_status = 'generated_ready'
            AND products.editorial_source_hash IS DISTINCT FROM EXCLUDED.source_facts_hash THEN 'stale'
          WHEN products.editorial_status = 'generated_ready' THEN 'generated_ready'
          WHEN products.editorial_status = 'stale'
            AND EXCLUDED.editorial_status IN ('pending', 'needs_review') THEN 'stale'
          WHEN EXCLUDED.editorial_status IN ('pending', 'needs_review', 'blocked', 'duplicate', 'stale')
            THEN EXCLUDED.editorial_status
          ELSE products.editorial_status
        END,
        editorial_quality_score = CASE
          WHEN products.editorial_status IN ('manual_locked', 'generated_ready', 'stale')
            AND EXCLUDED.editorial_status <> 'generated_ready' THEN products.editorial_quality_score
          ELSE COALESCE(EXCLUDED.editorial_quality_score, products.editorial_quality_score)
        END,
        editorial_model = CASE
          WHEN products.editorial_status IN ('manual_locked', 'generated_ready', 'stale')
            AND EXCLUDED.editorial_status <> 'generated_ready' THEN products.editorial_model
          ELSE COALESCE(EXCLUDED.editorial_model, products.editorial_model)
        END,
        editorial_prompt_version = CASE
          WHEN products.editorial_status IN ('manual_locked', 'generated_ready', 'stale')
            AND EXCLUDED.editorial_status <> 'generated_ready' THEN products.editorial_prompt_version
          ELSE COALESCE(EXCLUDED.editorial_prompt_version, products.editorial_prompt_version)
        END,
        editorial_generated_at = CASE
          WHEN products.editorial_status IN ('manual_locked', 'generated_ready', 'stale')
            AND EXCLUDED.editorial_status <> 'generated_ready' THEN products.editorial_generated_at
          ELSE COALESCE(EXCLUDED.editorial_generated_at, products.editorial_generated_at)
        END,
        editorial_block_reason = CASE
          WHEN products.editorial_status = 'manual_locked' THEN products.editorial_block_reason
          WHEN EXCLUDED.editorial_status = 'generated_ready' THEN NULL
          ELSE COALESCE(EXCLUDED.editorial_block_reason, products.editorial_block_reason)
        END,
        duplicate_of_product_id = COALESCE(EXCLUDED.duplicate_of_product_id, products.duplicate_of_product_id),
        content_updated_at = CASE
          WHEN EXCLUDED.editorial_status = 'generated_ready'
            AND EXCLUDED.editorial_writeup IS DISTINCT FROM products.editorial_writeup THEN NOW()
          ELSE products.content_updated_at
        END,
        last_verified_at = CASE WHEN $17 THEN NOW() ELSE products.last_verified_at END,
        updated_at = NOW()
      RETURNING (xmax = 0) AS inserted, slug
    `,
    [
      product.id,
      product.title,
      product.price,
      product.currency,
      product.imageUrl,
      product.affiliateUrl,
      product.source || 'amazon',
      product.sourceQuery,
      toPostgresTextArray(product.humorTags),
      product.punnyTitle || null,
      product.wittyDescription || null,
      product.qualityScore,
      product.rating || null,
      product.reviewCount || null,
      product.isActive,
      toPostgresVector(product.embedding),
      product.remotelyVerified !== false,
      product.editorialWriteup || null,
      JSON.stringify(product.sourceFacts || {}),
      currentSourceHash,
      product.editorialSourceHash || (product.editorialStatus === 'manual_locked' ? currentSourceHash : null),
      product.availabilityStatus || null,
      product.editorialStatus || 'pending',
      product.editorialQualityScore || null,
      product.editorialModel || null,
      product.editorialPromptVersion || null,
      product.editorialGeneratedAt || null,
      product.editorialBlockReason || null,
      product.duplicateOfProductId || null,
    ]
  );

  return {
    inserted: Boolean(result.rows[0]?.inserted),
    slug: result.rows[0]?.slug || product.slug || null,
  };
}

async function getActiveCatalogIdentities(query, { includeInactive = false } = {}) {
  if (includeInactive) return (await query('SELECT id, title FROM products')).rows;
  const result = await query(
    `SELECT id, slug, title, image_url AS "imageUrl", affiliate_url AS "affiliateUrl",
            quality_score AS "qualityScore", availability_status AS "availabilityStatus",
            availability_checked_at AS "availabilityCheckedAt", last_verified_at AS "lastVerifiedAt",
            editorial_status AS "editorialStatus", review_count AS "reviewCount",
            NULL::jsonb AS "sourceFacts"
     FROM products WHERE is_active = true AND title <> ''`
  );
  return result.rows;
}

async function getDailyRefreshProducts(query, { limit, featuredIds }) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 10 || !Array.isArray(featuredIds)
    || featuredIds.length > 100 || featuredIds.some(id => !/^[A-Z0-9]{10}$/.test(id))) throw new Error('daily_selection_invalid');
  const result = await query(`
    SELECT id, slug, title, price, currency, image_url, affiliate_url, source, source_query,
           humor_tags, punny_title, witty_description, quality_score, rating, review_count,
           is_active, last_verified_at, editorial_writeup, source_facts, source_facts_hash,
           editorial_source_hash, availability_status, availability_checked_at, editorial_status,
           editorial_quality_score, editorial_model, editorial_prompt_version,
           editorial_generated_at, editorial_block_reason, duplicate_of_product_id,
           (embedding IS NOT NULL) AS has_embedding
    FROM products
    WHERE source = 'amazon' AND is_active = true AND id ~ '^[A-Z0-9]{10}$'
    ORDER BY CASE WHEN id = ANY($2::text[]) THEN 0
      WHEN COALESCE(slug <> '' AND image_url <> ''
        AND editorial_status IN ('generated_ready', 'manual_locked') AND editorial_quality_score >= 0.8
        AND duplicate_of_product_id IS NULL
        AND UPPER(availability_status) IN ('IN_STOCK', 'IN_STOCK_SCARCE', 'INSTOCKSCARCE', 'AVAILABLE_DATE', 'LEADTIME', 'PREORDER')
        AND source_facts_hash <> '' AND source_facts_hash = editorial_source_hash
        AND CHAR_LENGTH(BTRIM(editorial_writeup, E' \\t\\n\\r')) >= 500
        AND CARDINALITY(REGEXP_SPLIT_TO_ARRAY(BTRIM(editorial_writeup, E' \\t\\n\\r'), '\\s+')) >= 90
        AND BTRIM(editorial_writeup, E' \\t\\n\\r') ~ '\\n\\s*\\n', false) THEN 1 ELSE 2 END,
      COALESCE(availability_checked_at, last_verified_at) ASC NULLS FIRST, updated_at ASC, id ASC
    LIMIT $1
  `, [limit, featuredIds]);
  return result.rows;
}

async function getExistingEditorialWriteups(query, excludedIds = []) {
  const result = await query(
    `SELECT editorial_writeup
     FROM products
     WHERE editorial_status IN ('generated_ready', 'manual_locked')
       AND editorial_writeup IS NOT NULL
       AND NOT (id = ANY($1::text[]))`,
    [excludedIds]
  );
  return result.rows.map((row) => row.editorial_writeup).filter(Boolean);
}

async function getAffiliateUrlMismatches(query, tag) {
  const result = await query(`SELECT id, affiliate_url FROM products
     WHERE source = 'amazon'
       AND id ~ '^[A-Z0-9]{10}$'
       AND (affiliate_url NOT LIKE '%' || id || '%' OR affiliate_url NOT LIKE '%tag=' || $1 || '%')`, [tag]);
  return result.rows;
}

async function updateAmazonAffiliateUrl(query, id, affiliateUrl) {
  const result = await query(`UPDATE products SET affiliate_url = $2, updated_at = NOW() WHERE id = $1`, [id, affiliateUrl]);
  return result.rowCount || 0;
}

async function getProductsForRevalidation(query, { limit, staleDays, publishedStaleDays, publishedSlots, legacySlots }) {
  const result = await query(`
      WITH candidates AS (
        SELECT id, last_verified_at, updated_at,
               COALESCE(availability_checked_at, last_verified_at) AS verified_at,
               COALESCE(
                 slug <> '' AND image_url <> ''
                 AND editorial_status IN ('generated_ready', 'manual_locked')
                 AND editorial_quality_score >= 0.8
                 AND duplicate_of_product_id IS NULL
                 AND UPPER(availability_status) IN ('IN_STOCK', 'IN_STOCK_SCARCE', 'INSTOCKSCARCE', 'AVAILABLE_DATE', 'LEADTIME', 'PREORDER')
                 AND source_facts_hash <> '' AND source_facts_hash = editorial_source_hash
                 AND CHAR_LENGTH(BTRIM(editorial_writeup, E' \\t\\n\\r')) >= 500
                 AND CARDINALITY(REGEXP_SPLIT_TO_ARRAY(BTRIM(editorial_writeup, E' \\t\\n\\r'), '\\s+')) >= 90
                 AND BTRIM(editorial_writeup, E' \\t\\n\\r') ~ '\\n\\s*\\n',
                 false
               ) AS published
        FROM products
        WHERE source = 'amazon' AND is_active = true AND id ~ '^[A-Z0-9]{10}$'
      ), ranked AS (
        SELECT id, published,
               ROW_NUMBER() OVER (
                 PARTITION BY published
                 ORDER BY CASE WHEN published THEN verified_at ELSE last_verified_at END ASC NULLS FIRST,
                          updated_at ASC, id ASC
               ) AS position
        FROM candidates
        WHERE (published AND (verified_at IS NULL OR verified_at <= NOW() - ($3 * INTERVAL '1 day')))
           OR (NOT published AND (last_verified_at IS NULL OR last_verified_at <= NOW() - ($2 * INTERVAL '1 day')))
      ), selected AS (
        SELECT id,
               CASE WHEN published AND position <= $4 THEN 0
                    WHEN NOT published AND position <= $5 THEN 1
                    WHEN published THEN 2 ELSE 3 END AS lane,
               position
        FROM ranked
        ORDER BY lane, position
        LIMIT $1
      )
      SELECT p.id, p.slug, p.title, p.price, p.currency, p.image_url, p.affiliate_url, p.source, p.source_query,
             p.humor_tags, p.punny_title, p.witty_description, p.quality_score, p.rating, p.review_count,
             p.is_active, p.last_verified_at, p.editorial_writeup, p.source_facts, p.source_facts_hash,
             p.editorial_source_hash, p.availability_status, p.availability_checked_at, p.editorial_status,
             p.editorial_quality_score, p.editorial_model, p.editorial_prompt_version,
             p.editorial_generated_at, p.editorial_block_reason, p.duplicate_of_product_id
      FROM selected JOIN products p USING (id)
      ORDER BY selected.lane, selected.position
    `, [limit, staleDays, publishedStaleDays, publishedSlots, legacySlots]);
  return result.rows;
}

async function deactivateConfirmedMissing(query, ids, deactivateAfterDays) {
  const result = await query(
    `
      UPDATE products
      SET is_active = false, updated_at = NOW()
      WHERE id = ANY($1::text[])
        AND COALESCE(last_verified_at, created_at) <= NOW() - ($2 * INTERVAL '1 day')
      RETURNING id
    `,
    [ids, deactivateAfterDays]
  );
  return result.rows.map((row) => row.id);
}

async function markConfirmedMissingUnavailable(query, ids) {
  const result = await query(
    `UPDATE products
     SET availability_status = 'UNAVAILABLE', availability_checked_at = NOW(), updated_at = NOW()
     WHERE id = ANY($1::text[])
     RETURNING id`,
    [ids]
  );
  return result.rows.map((row) => row.id);
}

async function getProductsNeedingEnrichment(query, limit, ids) {
  const result = await query(`
      SELECT
        id,
        slug,
        title,
        price,
        currency,
        image_url,
        affiliate_url,
        source,
        source_query,
        humor_tags,
        punny_title,
        witty_description,
        quality_score,
        rating,
        review_count,
        is_active,
        last_verified_at,
        editorial_writeup,
        source_facts,
        source_facts_hash,
        editorial_source_hash,
        availability_status,
        availability_checked_at,
        editorial_status,
        editorial_quality_score,
        editorial_model,
        editorial_prompt_version,
        editorial_generated_at,
        editorial_block_reason,
        duplicate_of_product_id
      FROM products
      WHERE (is_active = true OR $2::text[] IS NOT NULL)
        AND image_url IS NOT NULL
        AND affiliate_url IS NOT NULL
        AND title <> ''
        AND duplicate_of_product_id IS NULL
        AND ($2::text[] IS NULL OR id = ANY($2::text[]))
        AND (
          $2::text[] IS NOT NULL
          OR (
            editorial_status IN ('pending', 'stale', 'needs_review')
            OR source_facts_hash IS DISTINCT FROM editorial_source_hash
            OR (
              editorial_status NOT IN ('blocked', 'duplicate')
              AND (
                embedding IS NULL
                OR punny_title IS NULL
                OR witty_description IS NULL
                OR humor_tags IS NULL
                OR quality_score IS NULL
              )
            )
          )
        )
      ORDER BY
        CASE WHEN $2::text[] IS NULL THEN NULL ELSE array_position($2::text[], id) END,
        quality_score DESC NULLS LAST,
        updated_at DESC,
        id ASC
      LIMIT $1
    `, [limit, ids?.length ? ids : null]);
  return result.rows;
}

async function recordEditorialEvent(query, { runId, productId, eventType, status, details }) {
  await query(`INSERT INTO catalog_editorial_events (run_id, product_id, event_type, status, details)
     VALUES ($1, $2, $3, $4, $5::jsonb)`, [runId, productId, eventType, status, JSON.stringify(details)]);
}

async function markCatalogDuplicate(query, productId, winnerId, reason) {
  await query(`UPDATE products
     SET editorial_status = 'duplicate',
         editorial_block_reason = $3,
         duplicate_of_product_id = $2,
         updated_at = NOW()
     WHERE id = $1 AND editorial_status <> 'manual_locked'`, [productId, winnerId, reason]);
}

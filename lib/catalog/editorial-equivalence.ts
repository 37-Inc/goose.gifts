import { canonicalJson } from './canonical-json.ts';

type Row = Record<string, unknown>;
type SourceHash = (product: { title: unknown; imageUrl: unknown; sourceFacts: Row }) => string;
const HASH = /^[a-f0-9]{64}$/;
const APPROVED = ['generated_ready', 'manual_locked'];
const PROVENANCE = ['editorialModel', 'editorialPromptVersion', 'editorialGeneratedAt'] as const;
const TRIM = 'char(9,10,11,12,13,32,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288,65279)';
const snake = (key: string) => key.replace(/[A-Z]/g, c => '_' + c.toLowerCase());
function object(value: unknown): Row {
  if (typeof value === 'string') value = JSON.parse(value);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('editorial_equivalence_object');
  return value as Row;
}
function number(value: unknown): number | null {
  try {
    if (typeof value === 'string') value = JSON.parse(value);
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  } catch { return null; }
}

/** Only observed dimensional-unit casing is immaterial. No number, unit,
 * feature, missing value or other string is normalized away. */
export function normalizedEditorialFacts(value: unknown): string | null {
  try {
    const facts = object(value); if (!Object.keys(facts).length) return null;
    const dimensions = facts.itemDimensions;
    if (!dimensions || typeof dimensions !== 'object' || Array.isArray(dimensions)) return canonicalJson(facts);
    return canonicalJson({ ...facts, itemDimensions: Object.fromEntries(Object.entries(dimensions).map(([key, item]) =>
      [key, typeof item === 'string' ? item.replace(/^(\d+(?:\.\d+)?) (inches|pounds)$/i,
        (_, n: string, unit: string) => `${n} ${unit.toLowerCase()}`) : item])) });
  } catch { return null; }
}

/** Original sealed approval, NOT new copy/native/supplier proof. Callers still
 * require a previously indexable permanent base and exact nonmerchant grants.
 * The hasher is injected to keep this shared SQL/Worker module Node-free. */
export function originalEditorialEquivalent(source: unknown, current: Row, article: string, hash: SourceHash): boolean {
  try {
    const raw = object(source), facts = object(raw.source_facts), nowFacts = object(current.sourceFacts);
    const oldHash = raw.editorial_source_hash, quality = number(raw.editorial_quality_score);
    if (!current.sourceFacts || typeof current.sourceFacts !== 'object' || Array.isArray(current.sourceFacts)
      || !article || raw.editorial_writeup !== article || current.editorialWriteup !== article
      || typeof oldHash !== 'string' || !HASH.test(oldHash) || raw.source_facts_hash !== oldHash || current.editorialSourceHash !== oldHash
      || typeof current.sourceFactsHash !== 'string' || !HASH.test(current.sourceFactsHash)
      || typeof raw.editorial_status !== 'string' || !APPROVED.includes(raw.editorial_status)
      || typeof current.editorialStatus !== 'string' || ![...APPROVED, 'stale'].includes(current.editorialStatus)
      || quality === null || quality < .8 || quality > 1 || number(current.editorialQualityScore) !== quality
      || ['id', 'source', 'slug'].some(key => raw[key] !== current[key]) || raw.public_id !== current.publicId
      || PROVENANCE.some(key => typeof raw[snake(key)] !== 'string' || !String(raw[snake(key)]).trim()
        || current[key] !== raw[snake(key)])
      || hash({ title: raw.title, imageUrl: raw.image_url, sourceFacts: facts }) !== oldHash
      || hash({ title: current.title, imageUrl: current.imageUrl, sourceFacts: nowFacts }) !== current.sourceFactsHash) return false;
    const normalized = normalizedEditorialFacts(facts);
    return normalized !== null && normalized === normalizedEditorialFacts(nowFacts);
  } catch { return false; }
}

/** Narrow exporter view; current semantic labels must match the typed row. */
export function originalEditorialEquivalentRow(row: Row, article: string, hash: SourceHash): boolean {
  try {
    const current = object(row.maintenance_semantic);
    const labels = { id: 'id', publicId: 'public_id', slug: 'slug', source: 'source',
      sourceFactsHash: 'source_facts_hash', editorialSourceHash: 'editorial_source_hash', editorialStatus: 'editorial_status' };
    return Object.entries(labels).every(([key, column]) => current[key] === row[column])
      && current.isActive === (row.is_active === 1) && current.duplicateOfProductId === row.duplicate_of_product_id
      && typeof row.quality_score === 'number' && number(current.qualityScore) === row.quality_score
      && originalEditorialEquivalent(row.source_record_json, current, article, hash);
  } catch { return false; }
}

function and(parts: string[]): string {
  const middle = Math.floor(parts.length / 2);
  return parts.length === 1 ? parts[0] : `(${and(parts.slice(0, middle))} AND ${and(parts.slice(middle))})`;
}
const quality = (document: string, key: string) => {
  const value = `json_extract(${document},'$.${key}')`;
  return `(CASE WHEN json_type(${document},'$.${key}') IN ('integer','real','text') THEN
    CASE WHEN json_valid(${value}) THEN CASE WHEN json_type(${value}) IN ('integer','real')
    THEN CAST(${value} AS REAL) END END END)`;
};

/** SQL counterpart for the EXISTING immutable archive and canonical maintenance
 * writers. No hash is invented/rebound: JS recomputes both source hashes before
 * sealing, SQL rechecks original bindings and complete actual facts at commit.
 * Container atoms are NULL so object key ordering is not a factual change. */
export function originalEditorialEquivalenceSql(p: string, semantic: string, article: string): string {
  const raw = (key: string) => `json_extract(${p}.source_record_json,'$.${key}')`;
  const current = (key: string) => `json_extract(${semantic},'$.${key}')`;
  const oldFacts = raw('source_facts'), newFacts = current('sourceFacts');
  const safe = (facts: string) => `(CASE WHEN json_valid(${facts}) THEN ${facts} ELSE '{}' END)`;
  function tree(facts: string) {
    const number = `substr(t.atom,1,instr(t.atom,' ')-1)`;
    const normalized = `CASE WHEN ${and(["t.type='text'", "t.path='$.itemDimensions'",
      `json_type(${safe(facts)},'$.itemDimensions')='object'`, "instr(t.atom,' ')>1",
      "lower(substr(t.atom,instr(t.atom,' ')+1)) IN ('inches','pounds')",
      `length(trim(${number},'0123456789.'))=0`, `substr(${number},1,1)!='.'`, `substr(${number},-1)!='.'`,
      `length(${number})-length(replace(${number},'.',''))<=1`])}
      THEN substr(t.atom,1,instr(t.atom,' '))||lower(substr(t.atom,instr(t.atom,' ')+1)) ELSE t.atom END`;
    return `SELECT fullkey,CASE WHEN type IN ('integer','real') THEN 'number' ELSE type END,${normalized}
      FROM json_tree(${safe(facts)}) t`;
  }
  // Materialize the two tiny normalized trees once. Keeping normalization out
  // of compound EXCEPT operands also respects D1's100-depth publication limit.
  const sameFacts = `(WITH editorial_old_facts AS MATERIALIZED (${tree(oldFacts)}),
    editorial_current_facts AS MATERIALIZED (${tree(newFacts)}) SELECT
    NOT EXISTS(SELECT * FROM editorial_old_facts EXCEPT SELECT * FROM editorial_current_facts)
    AND NOT EXISTS(SELECT * FROM editorial_current_facts EXCEPT SELECT * FROM editorial_old_facts))`;
  return `coalesce(${and([
    `${raw('id')}=${p}.id`, `${raw('public_id')}=${p}.public_id`, `${raw('slug')}=${p}.slug`, `${raw('source')}=${p}.source`,
    `${raw('editorial_status')} IN ('generated_ready','manual_locked')`,
    `${p}.editorial_status IN ('generated_ready','manual_locked','stale')`,
    `typeof(${p}.source_facts_hash)='text' AND length(${p}.source_facts_hash)=64
      AND ${p}.source_facts_hash NOT GLOB '*[^a-f0-9]*'`,
    `${quality(`${p}.source_record_json`, 'editorial_quality_score')} BETWEEN 0.8 AND 1`,
    `${quality(semantic, 'editorialQualityScore')}=${quality(`${p}.source_record_json`, 'editorial_quality_score')}`,
    `typeof(${raw('editorial_source_hash')})='text' AND length(${raw('editorial_source_hash')})=64
      AND ${raw('editorial_source_hash')} NOT GLOB '*[^a-f0-9]*'`,
    `${raw('source_facts_hash')}=${raw('editorial_source_hash')}`, `${p}.editorial_source_hash=${raw('editorial_source_hash')}`,
    `${raw('editorial_writeup')}=${article}`, `${current('editorialWriteup')}=${article}`,
    ...Object.entries({ id: 'id', publicId: 'public_id', slug: 'slug', source: 'source', sourceFactsHash: 'source_facts_hash',
      editorialSourceHash: 'editorial_source_hash', editorialStatus: 'editorial_status' }).map(([key, column]) => `${current(key)}=${p}.${column}`),
    `json_type(${semantic},'$.isActive')='true' AND ${p}.is_active=1`,
    `json_type(${semantic},'$.duplicateOfProductId')='null' AND ${p}.duplicate_of_product_id IS NULL`,
    `${quality(semantic, 'qualityScore')}=${p}.quality_score`,
    ...PROVENANCE.map(key => and([`trim(${raw(snake(key))},${TRIM})!=''`,
      `typeof(${raw(snake(key))})='text'`, `${current(key)}=${raw(snake(key))}`])),
    `json_type(${safe(oldFacts)})='object'`, `json_type(${semantic},'$.sourceFacts')='object'`,
    `EXISTS(SELECT 1 FROM json_each(${safe(oldFacts)}))`,
    sameFacts,
  ])},0)`;
}

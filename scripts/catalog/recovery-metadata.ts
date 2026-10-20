import type { ReadOnlyHttpSource } from './export-postgres.ts';
import { canonicalJson, canonicalTimestamp } from './migration.ts';

type Row = Record<string, unknown>;
export interface MetadataSource {
  database: string; snapshot: string; observedAt: string; serverVersion: string;
  serverVersionNum: string; isolation: string; readOnly: string;
}
export interface RecoveryMetadata {
  schemaVersion: 1;
  binding: { kind: 'same-transaction' | 'later-observation'; archiveManifestSha256: string | null;
    archiveSnapshot: string; archiveObservedAt: string };
  source: MetadataSource;
  sequences: Array<{ schema: string; name: string; lastValue: string; isCalled: boolean;
    configuration: Row; ownedBy: Array<{ schema: string; table: string; column: string; dependency: string }> }>;
  triggers: Array<{ schema: string; table: string; name: string; enabled: string; definition: string }>;
  aclEvidence: Row; settingsEvidence: Row;
  sequenceConsistency: 'nontransactional-observations-not-a-write-barrier';
}
const FILTER = "n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema'";
const q = (value: string) => {
  if (typeof value!=='string'||!/^[a-z_][a-z0-9_]*$/.test(value)) throw new Error('Recovery metadata identifier requires review');
  return `"${value}"`;
};
const literal = (value: string) => `'${value.replaceAll("'", "''")}'`;
export const RECOVERY_SEQUENCE_INVENTORY_SQL = `SELECT coalesce(json_agg(json_build_object('schema',n.nspname,'name',c.relname)
  ORDER BY n.nspname,c.relname),'[]')::text AS sequences FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE c.relkind='S' AND ${FILTER}`;
/** ACLs/configuration are private evidence only. No pg_authid/password reads,
 * role creation, GRANT, SET or sequence-changing function is executed here.
 */
export const RECOVERY_METADATA_SQL = `SELECT json_build_object(
  'source',json_build_object('database',current_database(),'snapshot',txid_current_snapshot()::text,
    'observedAt',clock_timestamp()::text,'serverVersion',current_setting('server_version'),
    'serverVersionNum',current_setting('server_version_num'),'isolation',current_setting('transaction_isolation'),
    'readOnly',current_setting('transaction_read_only')),
  'triggers',(SELECT coalesce(json_agg(json_build_object('schema',n.nspname,'table',c.relname,'name',t.tgname,
    'enabled',t.tgenabled::text,'definition',pg_get_triggerdef(t.oid)) ORDER BY n.nspname,c.relname,t.tgname),'[]')
    FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE NOT t.tgisinternal AND ${FILTER}),
  'sequenceDefinitions',(SELECT coalesce(json_agg(json_build_object('schema',n.nspname,'name',c.relname,
    'configuration',json_build_object('data_type',format_type(s.seqtypid,NULL),'increment_by',s.seqincrement::text,
      'min_value',s.seqmin::text,'max_value',s.seqmax::text,'start_value',s.seqstart::text,'cache_size',s.seqcache::text,'cycle',s.seqcycle),
    'ownedBy',(SELECT coalesce(json_agg(json_build_object('schema',tn.nspname,'table',tc.relname,'column',a.attname,'dependency',d.deptype::text)),'[]')
      FROM pg_depend d JOIN pg_class tc ON tc.oid=d.refobjid JOIN pg_namespace tn ON tn.oid=tc.relnamespace
      JOIN pg_attribute a ON a.attrelid=tc.oid AND a.attnum=d.refobjsubid
      WHERE d.classid='pg_class'::regclass AND d.objid=c.oid AND d.refclassid='pg_class'::regclass AND d.deptype IN('a','i')))
    ORDER BY n.nspname,c.relname),'[]') FROM pg_sequence s JOIN pg_class c ON c.oid=s.seqrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace WHERE ${FILTER}),
  'aclEvidence',json_build_object(
    'database',(SELECT json_build_object('name',datname,'owner',pg_get_userbyid(datdba),'acl',datacl::text,
      'encoding',pg_encoding_to_char(encoding),'collation',datcollate,'ctype',datctype) FROM pg_database WHERE datname=current_database()),
    'schemas',(SELECT coalesce(json_agg(json_build_object('name',n.nspname,'owner',pg_get_userbyid(n.nspowner),'acl',n.nspacl::text) ORDER BY n.nspname),'[]') FROM pg_namespace n WHERE ${FILTER}),
    'relations',(SELECT coalesce(json_agg(json_build_object('schema',n.nspname,'name',c.relname,'kind',c.relkind::text,
      'owner',pg_get_userbyid(c.relowner),'acl',c.relacl::text) ORDER BY n.nspname,c.relname),'[]')
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind IN('r','p','f','S','v','m') AND ${FILTER}),
    'columns',(SELECT coalesce(json_agg(json_build_object('schema',n.nspname,'table',c.relname,'column',a.attname,'acl',a.attacl::text)
      ORDER BY n.nspname,c.relname,a.attnum),'[]') FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid
      JOIN pg_namespace n ON n.oid=c.relnamespace WHERE a.attnum>0 AND NOT a.attisdropped AND a.attacl IS NOT NULL AND ${FILTER}),
    'functions',(SELECT coalesce(json_agg(json_build_object('schema',n.nspname,'name',p.proname,'arguments',pg_get_function_identity_arguments(p.oid),
      'owner',pg_get_userbyid(p.proowner),'acl',p.proacl::text) ORDER BY n.nspname,p.proname,p.oid),'[]')
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE ${FILTER}
      AND NOT EXISTS(SELECT 1 FROM pg_depend d WHERE d.classid='pg_proc'::regclass AND d.objid=p.oid AND d.deptype='e')),
    'defaultPrivileges',(SELECT coalesce(json_agg(json_build_object('role',pg_get_userbyid(d.defaclrole),'schema',n.nspname,
      'objectType',d.defaclobjtype::text,'acl',d.defaclacl::text) ORDER BY d.defaclrole,d.defaclnamespace,d.defaclobjtype),'[]')
      FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace WHERE d.defaclnamespace=0 OR ${FILTER})),
  'settingsEvidence',json_build_object(
    'session',(SELECT json_object_agg(name,current_setting(name)) FROM unnest(ARRAY['TimeZone','DateStyle','client_encoding',
      'server_encoding','standard_conforming_strings','bytea_output','extra_float_digits','search_path']) name),
    'databaseRole',(SELECT coalesce(json_agg(json_build_object('database',d.datname,'role',r.rolname,'settings',s.setconfig)
      ORDER BY s.setdatabase,s.setrole),'[]') FROM pg_db_role_setting s LEFT JOIN pg_database d ON d.oid=s.setdatabase
      LEFT JOIN pg_roles r ON r.oid=s.setrole WHERE d.datname=current_database() OR
        (s.setdatabase=0 AND (s.setrole=0 OR r.rolname=current_user))),
    'scope','Current database plus export-role global settings; not cluster-wide')
)::text AS metadata`;

export function recoveryMetadataQueries(sequences: Array<{ schema: string; name: string }>): string[] {
  if (!Array.isArray(sequences) || sequences.length > 100 || new Set(sequences.map(s => `${s.schema}.${s.name}`)).size !== sequences.length) throw new Error('Recovery sequence inventory requires review');
  return [RECOVERY_METADATA_SQL,...sequences.map(s => `SELECT json_build_object('schema',${literal(s.schema)},'name',${literal(s.name)},
    'lastValue',last_value::text,'isCalled',is_called)::text AS state FROM ${q(s.schema)}.${q(s.name)}`)];
}
export function decodeRecoveryMetadata(results: Array<Array<Record<string,string>>>, binding: RecoveryMetadata['binding']): RecoveryMetadata {
  if (results[0]?.length !== 1) throw new Error('Recovery metadata response incomplete');
  const data = JSON.parse(results[0][0].metadata);
  const states = results.slice(1).map(rows => {
    if (rows.length !== 1) throw new Error('Recovery sequence observation incomplete');
    return JSON.parse(rows[0].state);
  });
  if (!Array.isArray(data.sequenceDefinitions) || data.sequenceDefinitions.length !== states.length
    || new Set(states.map(s => `${s.schema}.${s.name}`)).size !== states.length) throw new Error('Recovery sequence inventory changed');
  const sequences = data.sequenceDefinitions.map((definition: RecoveryMetadata['sequences'][number]) => {
    const state = states.find(s => s.schema === definition.schema && s.name === definition.name);
    if (!state) throw new Error('Recovery sequence inventory changed');
    return {...definition,lastValue:state.lastValue,isCalled:state.isCalled};
  });
  return {schemaVersion:1,binding,source:data.source,sequences,triggers:data.triggers,aclEvidence:data.aclEvidence,
    settingsEvidence:data.settingsEvidence,sequenceConsistency:'nontransactional-observations-not-a-write-barrier'};
}
/** Optional later observation, not a second data backup. The original manifest
 * checksum/snapshot are mandatory; even identical txid snapshots do NOT turn a
 * separate transaction into original-snapshot evidence. Caller protects output.
 */
export async function collectRecoveryMetadata(source: ReadOnlyHttpSource, original: {
  manifestSha256: string; settings: {database:string;snapshot:string;observedAt:string};
}): Promise<RecoveryMetadata> {
  if (!/^[a-f0-9]{64}$/.test(original.manifestSha256) || !original.settings.database || !original.settings.snapshot || !original.settings.observedAt) throw new Error('Original archive binding required');
  const planned = JSON.parse((await source.query(RECOVERY_SEQUENCE_INVENTORY_SQL))[0]?.sequences || 'null');
  if (!Array.isArray(planned)) throw new Error('Recovery sequence inventory unavailable');
  const queries = recoveryMetadataQueries(planned);
  const metadata = decodeRecoveryMetadata(await source.transaction(queries,{isolationLevel:'RepeatableRead',readOnly:true}),
    {kind:'later-observation',archiveManifestSha256:original.manifestSha256,archiveSnapshot:original.settings.snapshot,archiveObservedAt:original.settings.observedAt});
  validateRecoveryMetadata(metadata,original.manifestSha256,original.settings);
  return metadata;
}
export function validateRecoveryMetadata(metadata: RecoveryMetadata, manifestSha256: string, original: {database:string;snapshot:string;observedAt:string}): void {
  const b=metadata?.binding;const s=metadata?.source;
  if (metadata?.schemaVersion!==1 || !b || !s || s.database!==original.database || s.isolation!=='repeatable read' || s.readOnly!=='on'
    || typeof s.snapshot!=='string' || !s.snapshot || typeof s.serverVersion!=='string' || typeof s.serverVersionNum!=='string' || !/^\d{6}$/.test(s.serverVersionNum)
    || metadata.sequenceConsistency!=='nontransactional-observations-not-a-write-barrier'
    || !['same-transaction','later-observation'].includes(b.kind) || b.archiveSnapshot!==original.snapshot || b.archiveObservedAt!==original.observedAt
    || (b.kind==='same-transaction' ? b.archiveManifestSha256!==null || s.snapshot!==original.snapshot : b.archiveManifestSha256!==manifestSha256)
    || !Array.isArray(metadata.sequences) || metadata.sequences.length>100 || !Array.isArray(metadata.triggers) || metadata.triggers.length>100
    || !metadata.aclEvidence || !metadata.settingsEvidence || Buffer.byteLength(canonicalJson(metadata))>1_000_000) throw new Error('Recovery metadata binding/mode is invalid');
  const observed=canonicalTimestamp(s.observedAt);const archived=canonicalTimestamp(b.archiveObservedAt);
  if (!observed || !archived || observed<archived) throw new Error('Recovery metadata observation predates archive');
  if (!metadata.aclEvidence.database || ['schemas','relations','columns','functions','defaultPrivileges'].some(key=>!Array.isArray(metadata.aclEvidence[key]))
    || !metadata.settingsEvidence.session || !Array.isArray(metadata.settingsEvidence.databaseRole)) throw new Error('Recovery ACL/settings evidence incomplete');
  if (new Set(metadata.sequences.map(s=>`${s.schema}.${s.name}`)).size!==metadata.sequences.length
    || new Set(metadata.triggers.map(t=>`${t.schema}.${t.table}.${t.name}`)).size!==metadata.triggers.length) throw new Error('Recovery metadata contains duplicate identities');
  for (const sequence of metadata.sequences) {
    q(sequence.schema);q(sequence.name);
    if (typeof sequence.lastValue!=='string' || !/^-?\d+$/.test(sequence.lastValue) || typeof sequence.isCalled!=='boolean' || !sequence.configuration
      || !['integer','bigint'].includes(String(sequence.configuration.data_type)) || typeof sequence.configuration.cycle!=='boolean'
      || ['increment_by','min_value','max_value','start_value','cache_size'].some(key=>typeof sequence.configuration[key]!=='string'||!/^-?\d+$/.test(sequence.configuration[key] as string))
      || !Array.isArray(sequence.ownedBy) || sequence.ownedBy.length>1) throw new Error('Recovery sequence state is invalid');
    for (const owned of sequence.ownedBy) { q(owned.schema);q(owned.table);q(owned.column);if(owned.dependency!=='a')throw new Error('Identity sequence ownership requires review'); }
  }
  for (const trigger of metadata.triggers) {
    q(trigger.schema);q(trigger.table);q(trigger.name);
    if (!['O','D','R','A'].includes(trigger.enabled) || typeof trigger.definition!=='string') throw new Error('Recovery trigger mode is invalid');
  }
}

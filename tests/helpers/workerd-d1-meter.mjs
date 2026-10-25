import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';

// Local workerd counters, not provider quota or live billing evidence. Mirror
// the fixture's real SQL and indexes; SQLite total_changes omits B-tree writes
// and counting returned rows does not measure rows scanned by a predicate.
export function createWorkerdD1Meter(t){
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,compatibilityDate:'2026-10-19',
    durableObjects:{METER:{className:'Meter',useSQLite:true}},script:`
export class Meter {
  constructor(ctx){this.ctx=ctx}
  async fetch(request){
    const {queries}=await request.json();
    return Response.json(this.ctx.storage.transactionSync(()=>queries.map(q=>{
      const cursor=this.ctx.storage.sql.exec(q.sql,...q.params??[]);
      const results=cursor.toArray();
      return {results,rowsRead:cursor.rowsRead,rowsWritten:cursor.rowsWritten};
    })));
  }
}
export default {fetch(request,env){return env.METER.get(env.METER.idFromName('offline-only')).fetch(request)}}` }));
  t.after(()=>mf.dispose());let initialised=false;
  async function execute(queries){
    const response=await mf.dispatchFetch('http://localhost/sql',{method:'POST',headers:{Connection:'close'},body:JSON.stringify({queries})});
    const text=await response.text();assert.equal(response.status,200,text);return JSON.parse(text);
  }
  return{
    async initialise(sql){
      if(initialised)return;
      const directory=new URL('../../migrations/d1/',import.meta.url);
      const migrations=(await readdir(directory)).filter(n=>/^\d{4}.*\.sql$/.test(n)).sort();
      await execute(await Promise.all(migrations.map(async name=>({sql:await readFile(new URL(name,directory),'utf8'),params:[]}))));
      const triggers=sql.prepare("SELECT name,sql FROM sqlite_schema WHERE type='trigger'").all();
      const tables=sql.prepare("SELECT name,sql FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%'").all()
        .filter(row=>!/^CREATE VIRTUAL TABLE/i.test(row.sql)&&!/^products_fts_|^catalog_public_products_fts_/.test(row.name));
      await execute(triggers.map(row=>({sql:`DROP TRIGGER ${row.name}`,params:[]})));
      const pending=new Map(tables.map(table=>[table.name,table])),done=new Set();
      while(pending.size){
        const ready=[...pending.values()].filter(table=>sql.prepare(`PRAGMA foreign_key_list(${table.name})`).all().every(f=>f.table===table.name||done.has(f.table)));
        assert.ok(ready.length,'fixture tables must have a seedable foreign-key order');
        for(const table of ready){
          const rows=sql.prepare(`SELECT rowid,* FROM ${table.name}`).all();
          for(let offset=0;offset<rows.length;offset+=20)await execute(rows.slice(offset,offset+20).map(row=>{
            const keys=Object.keys(row);return{sql:`INSERT INTO ${table.name}(${keys}) VALUES(${keys.map(()=>'?')})`,params:Object.values(row)};}));
          done.add(table.name);pending.delete(table.name);
        }
      }
      const seed=[];
      for(const table of ['products_fts','catalog_public_products_fts'])
        seed.push({sql:`INSERT INTO ${table}(${table}) VALUES('rebuild')`,params:[]});
      seed.push(...triggers.map(row=>({sql:row.sql,params:[]})));
      await execute(seed);initialised=true;
    },
    async batch(queries,now){
      assert.equal(initialised,true);
      return execute(queries.map(q=>({...q,sql:q.sql.replace(/strftime\('%Y-%m-%dT%H:%M:%fZ',\s*'now'\)/g,`'${now}'`)})));
    },
  };
}

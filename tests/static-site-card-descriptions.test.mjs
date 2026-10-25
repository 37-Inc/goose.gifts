import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {renderToStaticMarkup} from 'react-dom/server';
import React from 'react';
import {factualCardDescription,LEGACY_DESCRIPTION_PLACEHOLDER} from '../static-site/lib/card-description.ts';
import {CatalogDescription} from '../static-site/components/CatalogPhotos.tsx';
globalThis.React=React;
const copy=JSON.parse(fs.readFileSync(new URL('../content/catalog-card-descriptions.json',import.meta.url),'utf8'));

test('all993 reviewed short descriptions are bounded, unique factual presentation records',()=>{
  const entries=Object.entries(copy);
  assert.equal(entries.length,993);
  assert.equal(new Set(entries.map(([,p])=>p.description)).size,993);
  for(const [id,p] of entries){
    assert.match(id,/^[A-Z0-9]{10}$/);
    assert.deepEqual(Object.keys(p).sort(),['description','title']);
    assert.ok(p.title.trim());
    assert.ok(p.description.length>=40&&p.description.length<=160);
    assert.ok(!p.description.includes('\n')&&!p.description.includes(LEGACY_DESCRIPTION_PLACEHOLDER));
  }
});
test('presentation override requires exact ID, title, source and original placeholder; fresh copy wins',()=>{
  const [id,note]=Object.entries(copy)[0];
  const p={id,source:'amazon',title:note.title,description:LEGACY_DESCRIPTION_PLACEHOLDER};
  assert.equal(factualCardDescription(p),note.description);
  for(const patch of [{id:'UNKNOWN'},{source:'etsy'},{title:note.title+' changed'}])
    assert.equal(factualCardDescription({...p,...patch}),LEGACY_DESCRIPTION_PLACEHOLDER);
  assert.equal(factualCardDescription({...p,description:'New verified short description.'}),'New verified short description.');
  assert.equal(p.description,LEGACY_DESCRIPTION_PLACEHOLDER);
});
test('card and detail consumers render the factual short line without exposing the generic fallback',()=>{
  const [id,note]=Object.entries(copy)[0];
  for(const card of [true,false]){
    const html=renderToStaticMarkup(React.createElement(CatalogDescription,
      {id,source:'amazon',title:note.title,fallback:LEGACY_DESCRIPTION_PLACEHOLDER,card}));
    assert.ok(!html.includes(LEGACY_DESCRIPTION_PLACEHOLDER));
    assert.ok(html.includes(card?'card-description':'detail-line'));
  }
});

import assert from 'node:assert/strict';
import test from 'node:test';
import {reviewedUploadResume} from '../scripts/catalog/run-cloudflare-weekly.ts';

const digest=n=>String(n).repeat(64),ref=n=>({sha256:digest(n),reference:`objects/${digest(n)}.json`});
function fixture(){
  const saved={sha256:digest(1),checkpoint:{phase:'attention',owner:{phase:'freezing'},phaseComplete:null,
    pins:{publicationUploadPending:ref(2),publicationUploadReview:ref(3)},
    control:{publication:{stage:'uploading',requestId:digest(4),packageSha256:digest(5),configSha256:digest(6),
      permit:null,versionReference:null,deploymentId:null}}}};
  const retry={approval:{schemaVersion:4,requestId:digest(4),packageSha256:digest(5),configSha256:digest(6),checkpointSha256:digest(1),
    reviewPinSha256:digest(3),evidenceSha256:digest(7),reviewReference:'synthetic/one-preflight-continuation',
    reviewedAt:'2026-10-24T21:00:00.000Z',authorizationSha256:digest(8)},evidence:ref(7)};
  return{saved,retry};
}

test('only exact V4 initial attention enters publication; acknowledged same retry may resume without matching the old checkpoint',()=>{
  const f=fixture(),before=structuredClone(f);assert.equal(reviewedUploadResume(f.saved,f.retry),true);assert.deepEqual(f,before);
  const p=f.saved.checkpoint.pins,c=f.saved.checkpoint.control.publication;
  p.publicationUploadRetryPending=ref(8);p.publicationUploadRetryAcknowledged=ref(9);f.saved.sha256=digest(0);
  assert.equal(reviewedUploadResume(f.saved,f.retry),true);
  c.stage='uploaded';c.versionReference='00000000-0000-4000-8000-000000000001';
  assert.equal(reviewedUploadResume(f.saved,f.retry),true);
});

test('unapproved/legacy/malformed authority or initial checkpoint, owner, package, config, request and pin drift never leaves attention',async t=>{
  const cases={
    approval:f=>{f.retry=undefined;},checkpoint:f=>{f.saved=null;},legacy:f=>{f.retry.approval.schemaVersion=1;delete f.retry.approval.reviewedAt;delete f.retry.approval.authorizationSha256;},
    extra:f=>{f.retry.unreviewed=true;},authorization:f=>{f.retry.approval.authorizationSha256='not-a-hash';},
    extension:f=>{f.retry.approval.activationDeadline='2026-10-24T23:30:00.000Z';},
    phase:f=>{f.saved.checkpoint.phase='phase_failed';},owner:f=>{f.saved.checkpoint.owner.phase='writing';},
    ownerMissing:f=>{f.saved.checkpoint.owner=null;},publication:f=>{delete f.saved.checkpoint.control.publication;},
    permit:f=>{f.saved.checkpoint.control.publication.permit={issued:true};},deployment:f=>{f.saved.checkpoint.control.publication.deploymentId='already-deployed';},
    stage:f=>{f.saved.checkpoint.control.publication.stage='built';},version:f=>{f.saved.checkpoint.control.publication.versionReference='already-uploaded';},
    sha:f=>{f.saved.sha256=digest(0);},request:f=>{f.retry.approval.requestId=digest(0);},
    package:f=>{f.retry.approval.packageSha256=digest(0);},config:f=>{f.retry.approval.configSha256=digest(0);},
    review:f=>{f.retry.approval.reviewPinSha256=digest(0);},evidence:f=>{f.retry.evidence.sha256=digest(0);},
    missingPending:f=>{delete f.saved.checkpoint.pins.publicationUploadPending;},
    missingReview:f=>{delete f.saved.checkpoint.pins.publicationUploadReview;},
    oldAck:f=>{f.saved.checkpoint.pins.publicationUploadAcknowledged=ref(8);},
    orphanRetryAck:f=>{f.saved.checkpoint.pins.publicationUploadRetryAcknowledged=ref(9);},
    missingReference:f=>{delete f.retry.evidence.reference;},
    foreignReference:f=>{f.retry.evidence.reference=`objects/${digest(0)}.json`;},
  };
  for(const [name,mutate]of Object.entries(cases))await t.test(name,()=>{
    const f=fixture();mutate(f);assert.equal(reviewedUploadResume(f.saved,f.retry),false);
  });
});

test('retry without genuine ACK cannot reopen even when a matching uploaded version is visible',async t=>{
  for(const stage of ['uploading','uploaded','activating','published'])await t.test(stage,()=>{
    const f=fixture();f.saved.checkpoint.pins.publicationUploadRetryPending=ref(8);f.saved.checkpoint.control.publication.stage=stage;
    if(stage!=='uploading')f.saved.checkpoint.control.publication.versionReference='00000000-0000-4000-8000-000000000001';
    assert.equal(reviewedUploadResume(f.saved,f.retry),false);
  });
  const f=fixture();f.saved.checkpoint.pins.publicationUploadRetryPending=ref(8);f.saved.checkpoint.pins.publicationUploadRetryAcknowledged=ref(9);
  f.saved.checkpoint.control.publication.stage='activating';assert.equal(reviewedUploadResume(f.saved,f.retry),false);
});

test('transport continuation retains previous unacknowledged marker and has its own genuine ACK gate',async t=>{
  const make=()=>{const f=fixture();f.saved.checkpoint.phase='publishing';f.saved.checkpoint.pins.publicationUploadRetryPending=ref(8);
    f.retry.transport={previous:ref(8)};return f;};
  const valid=make();assert.equal(reviewedUploadResume(valid.saved,valid.retry),true);
  for(const [name,change]of Object.entries({
    noDescriptor:f=>{delete f.retry.transport;},wrongPrevious:f=>{f.retry.transport.previous=ref(9);},
    missingPrevious:f=>{delete f.saved.checkpoint.pins.publicationUploadRetryPending;},
    previousACK:f=>{f.saved.checkpoint.pins.publicationUploadRetryAcknowledged=ref(9);},
    extraAuthority:f=>{f.retry.transport.force=true;},
    newMissingACK:f=>{f.saved.checkpoint.pins.publicationUploadTransportPending=ref(9);},
    orphanNewACK:f=>{f.saved.checkpoint.pins.publicationUploadTransportAcknowledged=ref(9);},
  }))await t.test(name,()=>{const f=make();change(f);assert.equal(reviewedUploadResume(f.saved,f.retry),false);});
  valid.saved.checkpoint.pins.publicationUploadTransportPending=ref(9);valid.saved.checkpoint.pins.publicationUploadTransportAcknowledged=ref(0);
  valid.saved.sha256=digest(0);valid.saved.checkpoint.control.publication.stage='uploaded';valid.saved.checkpoint.control.publication.versionReference='uploaded';
  assert.equal(reviewedUploadResume(valid.saved,valid.retry),true);
});

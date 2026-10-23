import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const file=process.argv[2]||new URL('../ui-resource/dgn-production-resources.js',import.meta.url);
const src=fs.readFileSync(file,'utf8');
const context={window:{}};vm.createContext(context);vm.runInContext(src,context);
const r=context.window.DGNProductionResources;
assert.ok(r,'generated resource object missing');
assert.equal(r.schema,2);
assert.equal(r.sourceCommit,'291d4fb201a647f128c02f9e916b057a266e600a');
assert.equal(r.framebufferContract.colorDepth,16);
assert.equal(r.framebufferContract.color16Swap,1);
assert.equal(r.externalIconBank.availableInGit,true);
assert.ok(r.icons.gps && r.icons.gps.w===16 && r.icons.gps.h===16);
assert.ok(r.icons.soundOn && r.icons.soundOn.w===16 && r.icons.soundOn.h===16);
assert.ok(r.icons.statusBt && r.icons.statusBt.w===16 && r.icons.statusBt.h===16 && r.icons.statusBt.bpp===4);
assert.equal(r.icons.statusBt.gitBlobSha,'760771b40ac2a8dd072f79355b81005927fb344c');
assert.ok(r.icons.status4g && r.icons.status4g.w===16 && r.icons.status4g.h===16 && r.icons.status4g.bpp===4);
assert.equal(r.icons.status4g.gitBlobSha,'b32ffeb25c3e9059f0aab5bc314255fce10b0871');
assert.ok(r.icons.statusGps && r.icons.statusGps.w===16 && r.icons.statusGps.h===16 && r.icons.statusGps.bpp===4);
assert.equal(r.icons.statusGps.gitBlobSha,'ba31d77ca0d4ebd36f8f5f8f34e8cd436aa73af7');
for(let i=0;i<5;i++) {
  const icon=r.icons[`battery${i}`];
  assert.ok(icon && icon.w===30 && icon.h===14 && icon.bpp===1,`battery${i} missing`);
}
assert.equal(r.icons.battery0.gitBlobSha,'6cb7b93816e5349c97d3c7882447d1145a713bef');
assert.equal(r.icons.battery4.gitBlobSha,'cf3e7aaab9cc72cab018a77606e9cf84b4bafe82');
assert.ok(r.icons.batteryExternal && r.icons.batteryExternal.w===30 && r.icons.batteryExternal.h===14);
assert.equal(r.icons.batteryExternal.gitBlobSha,'a7601b69a3325b08cc17fd252f32c2c90d5f8ac6');
const expected={
  '14':'3b52e56f6d120f83c078566b3074d9d3293f46b9',
  '16':'0b952f3eb74de851c9da75911cf4dc7aa75a55b3',
  '46':'ac5a5bd836927007530611ea294d54ff67a086c9'
};
for(const [k,sha] of Object.entries(expected)) {
  const f=r.fonts[k]; assert.ok(f,`font ${k} missing`);
  assert.equal(f.gitBlobSha,sha);
  assert.equal(f.bpp,4);
  assert.equal(f.payloadEncoding,'native-lvgl-glyph-bytes');
  assert.ok([0,1,2].includes(f.bitmapFormat));
  assert.ok(f.glyphCount>0);
}
console.log('Exact compiled resource metadata and status icons OK');

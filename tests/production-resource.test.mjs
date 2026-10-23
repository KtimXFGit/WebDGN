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
assert.equal(r.externalIconBank.availableInGit,false);
assert.ok(r.icons.gps && r.icons.gps.w===16 && r.icons.gps.h===16);
assert.ok(r.icons.soundOn && r.icons.soundOn.w===16 && r.icons.soundOn.h===16);
assert.equal(r.icons.statusBt,undefined,'BT must use the firmware text fallback when external bank is absent');
assert.equal(r.icons.battery,undefined,'battery must not be synthesized when external RGB565A8 bank is absent');
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
console.log('Exact compiled resource metadata OK');

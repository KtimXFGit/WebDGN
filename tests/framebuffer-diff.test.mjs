import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';

const root=path.resolve(new URL('..',import.meta.url).pathname);
const tool=path.join(root,'tools','diff-framebuffer.mjs');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'webdgn-fb-'));
const bytes=240*320*2;
const a=Buffer.alloc(bytes,0),b=Buffer.alloc(bytes,0);
const pa=path.join(tmp,'a.bin'),pb=path.join(tmp,'b.bin');
fs.writeFileSync(pa,a);fs.writeFileSync(pb,b);
let run=spawnSync(process.execPath,[tool,pa,pb],{encoding:'utf8'});
assert.equal(run.status,0,run.stderr);
let json=JSON.parse(run.stdout);
assert.equal(json.identical,true);
assert.equal(json.differingPixels,0);

// Change two stored LVGL RGB565 words at known positions.
b.writeUInt16LE(0x3412,(10+20*240)*2);
b.writeUInt16LE(0x7856,(12+22*240)*2);
fs.writeFileSync(pb,b);
run=spawnSync(process.execPath,[tool,pa,pb],{encoding:'utf8'});
assert.equal(run.status,1,run.stderr);
json=JSON.parse(run.stdout);
assert.equal(json.identical,false);
assert.equal(json.differingPixels,2);
assert.deepEqual(json.boundingBox,{x:10,y:20,w:3,h:3});
assert.equal(json.format,'LVGL_RGB565_SWAP16_LE_WORDS');
fs.rmSync(tmp,{recursive:true,force:true});
console.log('Framebuffer golden-diff tooling OK');

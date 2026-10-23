import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const files=['../dgn-framebuffer-codec.js','../dgn-framebuffer-core.js','../dgn-production-ui.js'];
const src=files.map(f=>fs.readFileSync(new URL(f,import.meta.url),'utf8'));
const context = { window: {}, console, Uint8Array, Uint16Array, Uint8ClampedArray, Math, Map, Date, Array, Object, String, Number, parseInt };
context.window.window = context.window;
vm.createContext(context);
for(const code of src) vm.runInContext(code, context);
const p = context.window.DGNFramebufferPrimitives;
assert.ok(p, 'framebuffer primitives should be exposed');
assert.equal(p.LV_COLOR_16_SWAP, 1);
assert.equal(p.hexToLv565('#FF0000'), 0x00F8, 'red must be stored byte-swapped RGB565');
assert.equal(p.hexToLv565('#0000FF'), 0x1F00, 'blue must be stored byte-swapped RGB565');
assert.equal(p.hexToLv565('#FFFFFF'), 0xFFFF);
assert.equal(p.hexToLv565('#000000'), 0x0000);
assert.deepEqual(Array.from(p.lv565ToRgb888(0x00F8)), [255,0,0]);
const red = p.hexToLv565('#FF0000'), blue = p.hexToLv565('#0000FF');
assert.equal(p.lvColorMix16(red, blue, 255), red);
assert.equal(p.lvColorMix16(red, blue, 0), blue);

// Small bitstream exercising LVGL's SINGLE -> REPEAT -> SINGLE states.
// Decoded 4bpp samples: 1, 1, 1, 2.
const bits='00010001100010'.padEnd(16,'0');
const packed=new Uint8Array([parseInt(bits.slice(0,8),2),parseInt(bits.slice(8,16),2)]);
const next=p.createRleReader(packed,4);
assert.deepEqual([next(),next(),next(),next()],[1,1,1,2]);

const fb = new p.Framebuffer(null);
assert.ok(fb.data instanceof Uint16Array);
fb.clear('#000000');
fb.pixel(0,0,'#FF0000');
assert.equal(fb.data[0], 0x00F8);
console.log('RGB565 framebuffer primitives OK');

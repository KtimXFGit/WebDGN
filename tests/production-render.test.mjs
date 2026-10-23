import fs from 'node:fs';
import assert from 'node:assert/strict';
const files=['../dgn-framebuffer-codec.js','../dgn-framebuffer-core.js','../dgn-production-ui.js'];
const src=files.map(f=>fs.readFileSync(new URL(f,import.meta.url),'utf8')).join('\n');
for(const token of ['Uint16Array','LV_COLOR_16_SWAP','lvColorMix16','createRleReader','decodeGlyph','LVGL_RGB565_SWAP16','putImageData','DGNProductionResources']) {
  assert.ok(src.includes(token),`missing production framebuffer token: ${token}`);
}
assert.ok(!src.includes('fillText('),'Production renderer must not use browser text rasterization');
assert.ok(!src.includes('new Uint8ClampedArray(W*H*4)'), 'RGBA must not be the working framebuffer');
console.log('Production renderer static checks OK');

import fs from 'node:fs';
import assert from 'node:assert/strict';
const files=['../dgn-framebuffer-codec.js','../dgn-framebuffer-core.js','../dgn-production-ui.js'];
const src=files.map(f=>fs.readFileSync(new URL(f,import.meta.url),'utf8')).join('\n');
for(const token of ['Uint16Array','LV_COLOR_16_SWAP','lvColorMix16','createRleReader','decodeGlyph','LVGL_RGB565_SWAP16','putImageData','DGNProductionResources','drawLogScale','Math.log10','drawCellularBars','batterySegments','icons.statusBt','batteryExternal','navHeight','glyphScaled','textCenterScaled','drawLeftTriangle',"{e:4,t:'10k'}","{e:-2,t:'.01'}"]) {
  assert.ok(src.includes(token),`missing production framebuffer token: ${token}`);
}
assert.ok(!src.includes('fillText('),'Production renderer must not use browser text rasterization');
assert.ok(!src.includes('new Uint8ClampedArray(W*H*4)'), 'RGBA must not be the working framebuffer');
assert.ok(!src.includes("tx(s, '计数率', 'COUNT RATE')"),'home count-rate card must stay removed from Production renderer');
assert.ok(!src.includes('const segments = 8'),'legacy block-style logarithmic meter must not return');
assert.ok(!src.includes("'00:12:36'"),'compact cumulative-dose bar must stay single-line');

const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
assert.ok(app.includes('DGNProductionUI.render(state,canvas)'), 'app must call Production renderer as render(state, canvas)');
assert.ok(!app.includes('DGNProductionUI.render(canvas,state'), 'legacy canvas/state call order must not return');
assert.ok(app.includes("resources.fonts?.['14']?.glyphCount"), 'app must read current compiled-resource schema');
assert.ok(!app.includes('source.lvFontConv'), 'legacy regenerated-font metadata must not return');

console.log('Production renderer static checks OK');

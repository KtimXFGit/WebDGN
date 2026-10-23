import fs from 'node:fs';
const renderer=fs.readFileSync(new URL('../dgn-production-ui.js',import.meta.url),'utf8');
const builder=fs.readFileSync(new URL('../tools/build-production-resources.py',import.meta.url),'utf8');
if(renderer.includes('fillText('))throw new Error('Production renderer must not use browser text rasterization');
for(const token of ['glyph(', 'textWidth(', 'RGB565','DGNProductionResources'])if(!renderer.includes(token))throw new Error(`renderer missing ${token}`);
for(const token of ['lv_font_conv','763146584CF0710223441356B4395E279021B0806C196614377A7A0174AE074A','421F26B23E2BE6B98373D32ACD3CB2897B154D4BF0A77D26534CE476E4CBED53','decompress(','battery_masks'])if(!builder.includes(token))throw new Error(`resource builder missing ${token}`);
console.log('production render chain checks passed');

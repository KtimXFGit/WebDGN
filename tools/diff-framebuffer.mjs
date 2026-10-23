#!/usr/bin/env node
import fs from 'node:fs';
import crypto from 'node:crypto';

const W=240,H=320,BYTES=W*H*2;
const [,,expectedPath,actualPath]=process.argv;
if(!expectedPath||!actualPath){
  console.error('Usage: node tools/diff-framebuffer.mjs <device-or-golden.bin> <web.bin>');
  console.error(`Each file must be ${BYTES} bytes: ${W}x${H}, little-endian uint16 words storing LV_COLOR_16_SWAP=1 RGB565.`);
  process.exit(2);
}
const a=fs.readFileSync(expectedPath),b=fs.readFileSync(actualPath);
if(a.length!==BYTES||b.length!==BYTES){
  console.error(`Invalid framebuffer size: expected ${BYTES} bytes; got ${a.length} and ${b.length}.`);
  process.exit(2);
}
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const swap16=v=>((v>>>8)|((v&0xff)<<8))&0xffff;
const rgb=v=>{v=swap16(v);return [(v>>>11)&31,(v>>>5)&63,v&31];};
let diff=0,minX=W,minY=H,maxX=-1,maxY=-1;
let sumR=0,sumG=0,sumB=0,maxR=0,maxG=0,maxB=0;
for(let i=0;i<W*H;i++){
  const av=a.readUInt16LE(i*2),bv=b.readUInt16LE(i*2);
  if(av===bv) continue;
  diff++;
  const x=i%W,y=(i/W)|0;
  if(x<minX)minX=x;if(x>maxX)maxX=x;if(y<minY)minY=y;if(y>maxY)maxY=y;
  const ar=rgb(av),br=rgb(bv);
  const dr=Math.abs(ar[0]-br[0]),dg=Math.abs(ar[1]-br[1]),db=Math.abs(ar[2]-br[2]);
  sumR+=dr;sumG+=dg;sumB+=db;
  if(dr>maxR)maxR=dr;if(dg>maxG)maxG=dg;if(db>maxB)maxB=db;
}
const result={
  format:'LVGL_RGB565_SWAP16_LE_WORDS',width:W,height:H,bytes:BYTES,
  reference:{path:expectedPath,sha256:sha(a)},actual:{path:actualPath,sha256:sha(b)},
  identical:diff===0,differingPixels:diff,differingPercent:Number((diff*100/(W*H)).toFixed(6)),
  boundingBox:diff?{x:minX,y:minY,w:maxX-minX+1,h:maxY-minY+1}:null,
  channelDelta565:diff?{
    mean:{r5:Number((sumR/diff).toFixed(6)),g6:Number((sumG/diff).toFixed(6)),b5:Number((sumB/diff).toFixed(6))},
    max:{r5:maxR,g6:maxG,b5:maxB}
  }:{mean:{r5:0,g6:0,b5:0},max:{r5:0,g6:0,b5:0}}
};
console.log(JSON.stringify(result,null,2));
process.exit(diff===0?0:1);

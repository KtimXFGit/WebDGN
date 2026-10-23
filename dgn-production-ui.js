(() => {
'use strict';

const W=240,H=320;
const RES=()=>window.DGNProductionResources;
const decCache=new Map();
const rgbCache=new Map();

function b64(s){
  if(!s)return new Uint8Array(0);
  let v=decCache.get(s); if(v)return v;
  const raw=atob(s);v=new Uint8Array(raw.length);
  for(let i=0;i<raw.length;i++)v[i]=raw.charCodeAt(i);
  decCache.set(s,v);return v;
}
function rgb(hex){
  let c=rgbCache.get(hex);if(c)return c;
  const n=parseInt(hex.slice(1),16),r=(n>>16)&255,g=(n>>8)&255,bv=n&255;
  /* ST7789V framebuffer is RGB565 in the production LVGL port. */
  const q=[Math.round(Math.round(r*31/255)*255/31),Math.round(Math.round(g*63/255)*255/63),Math.round(Math.round(bv*31/255)*255/31)];
  rgbCache.set(hex,q);return q;
}
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}

class Framebuffer {
  constructor(canvas){
    this.canvas=canvas;this.ctx=canvas.getContext('2d',{alpha:false});
    this.data=new Uint8ClampedArray(W*H*4);
  }
  clear(color){const c=rgb(color);for(let i=0;i<W*H;i++){const p=i*4;this.data[p]=c[0];this.data[p+1]=c[1];this.data[p+2]=c[2];this.data[p+3]=255;}}
  pixel(x,y,color,opa=255){x|=0;y|=0;if(x<0||x>=W||y<0||y>=H||opa<=0)return;const c=rgb(color),p=(y*W+x)*4;if(opa>=255){this.data[p]=c[0];this.data[p+1]=c[1];this.data[p+2]=c[2];return;}const inv=255-opa;this.data[p]=Math.round((c[0]*opa+this.data[p]*inv)/255);this.data[p+1]=Math.round((c[1]*opa+this.data[p+1]*inv)/255);this.data[p+2]=Math.round((c[2]*opa+this.data[p+2]*inv)/255);}
  rect(x,y,w,h,color){x|=0;y|=0;w|=0;h|=0;for(let yy=0;yy<h;yy++)for(let xx=0;xx<w;xx++)this.pixel(x+xx,y+yy,color);}
  hline(x,y,w,color){for(let i=0;i<w;i++)this.pixel(x+i,y,color);}
  vline(x,y,h,color){for(let i=0;i<h;i++)this.pixel(x,y+i,color);}
  frame(x,y,w,h,color,width=1){for(let i=0;i<width;i++){this.hline(x+i,y+i,w-i*2,color);this.hline(x+i,y+h-1-i,w-i*2,color);this.vline(x+i,y+i,h-i*2,color);this.vline(x+w-1-i,y+i,h-i*2,color);}}
  insideRound(xx,yy,w,h,r){if(r<=0)return xx>=0&&yy>=0&&xx<w&&yy<h;if(xx<0||yy<0||xx>=w||yy>=h)return false;const cx=xx<r?r-.5:(xx>=w-r?w-r-.5:xx),cy=yy<r?r-.5:(yy>=h-r?h-r-.5:yy),dx=xx-cx,dy=yy-cy;return (xx>=r&&xx<w-r)||(yy>=r&&yy<h-r)||dx*dx+dy*dy<=r*r;}
  roundRect(x,y,w,h,r,bg,border,bw=1){for(let yy=0;yy<h;yy++)for(let xx=0;xx<w;xx++){if(!this.insideRound(xx,yy,w,h,r))continue;let c=bg;if(border&&bw){const iw=w-2*bw,ih=h-2*bw,ir=Math.max(0,r-bw);if(iw<=0||ih<=0||!this.insideRound(xx-bw,yy-bw,iw,ih,ir))c=border;}this.pixel(x+xx,y+yy,c);}}
  circle(x,y,d,color){const r=d/2,cx=x+r-.5,cy=y+r-.5;for(let yy=0;yy<d;yy++)for(let xx=0;xx<d;xx++){const dx=x+xx-cx,dy=y+yy-cy;if(dx*dx+dy*dy<=r*r)this.pixel(x+xx,y+yy,color);}}
  line(x0,y0,x1,y1,color){x0|=0;y0|=0;x1|=0;y1|=0;let dx=Math.abs(x1-x0),sx=x0<x1?1:-1,dy=-Math.abs(y1-y0),sy=y0<y1?1:-1,e=dx+dy;for(;;){this.pixel(x0,y0,color);if(x0===x1&&y0===y1)break;const e2=e*2;if(e2>=dy){e+=dy;x0+=sx}if(e2<=dx){e+=dx;y0+=sy}}}
  glyph(x,y,fontKey,cp,color){const f=RES()?.fonts?.[fontKey],g=f?.glyphs?.[String(cp)]||f?.glyphs?.['63'];if(!f||!g)return 0;const [adv,w,h,ox,oy,enc]=g;if(!w||!h)return adv;const bytes=b64(enc);const top=y+f.lineHeight-f.baseLine-h-oy;let pi=0;for(let yy=0;yy<h;yy++)for(let xx=0;xx<w;xx++,pi++){const byte=bytes[pi>>1]||0,a=(pi&1)?(byte&15):(byte>>4);if(a)this.pixel(x+ox+xx,top+yy,color,a*17);}return adv;}
  textWidth(fontKey,text){const f=RES()?.fonts?.[fontKey];if(!f)return 0;let w=0;for(const ch of String(text)){const g=f.glyphs[String(ch.codePointAt(0))]||f.glyphs['63'];if(g)w+=g[0];}return w;}
  text(x,y,fontKey,text,color){let p=x;for(const ch of String(text))p+=this.glyph(p,y,fontKey,ch.codePointAt(0),color);return p-x;}
  textRight(right,y,fontKey,text,color){return this.text(right-this.textWidth(fontKey,text),y,fontKey,text,color);}
  textCenter(left,width,y,fontKey,text,color){const tw=this.textWidth(fontKey,text);return this.text(left+Math.max(0,Math.floor((width-tw)/2)),y,fontKey,text,color);}
  icon(x,y,icon,color){if(!icon)return;const bytes=b64(icon.data);if(icon.bpp===1){const stride=Math.ceil(icon.w/8);for(let yy=0;yy<icon.h;yy++)for(let xx=0;xx<icon.w;xx++)if(bytes[yy*stride+(xx>>3)]&(0x80>>(xx&7)))this.pixel(x+xx,y+yy,color);}else{let i=0;for(let yy=0;yy<icon.h;yy++)for(let xx=0;xx<icon.w;xx++,i++){const v=(i&1)?(bytes[i>>1]&15):(bytes[i>>1]>>4);if(v)this.pixel(x+xx,y+yy,color,v*17);}}}
  present(){const img=new ImageData(this.data,W,H);this.ctx.imageSmoothingEnabled=false;this.ctx.putImageData(img,0,0);}
}

function tx(s,zh,en){return s.language==='zh'?zh:en}
function statusColor(s,k,P){return k==='fault'?P.red:k==='alarm'?P.yellow:k==='normal'?P.green:k==='detect'?P.blue:P.muted}
function statusText(s,k){return ({normal:tx(s,'正常','Normal'),alarm:tx(s,'报警','Alarm'),fault:tx(s,'故障','Fault'),detect:tx(s,'识别中','Detect'),offline:tx(s,'未连接','Offline')})[k]||tx(s,'未连接','Offline')}
function card(f,r,P,border=P.grid,width=1){f.roundRect(r.x,r.y,r.w,r.h,4,P.panel,border,width)}
function dot(f,x,y,color){f.rect(x,y,6,6,color)}
function batteryIndex(percent){return percent<=10?0:percent<=25?1:percent<=50?2:percent<=75?3:4}
function header(f,s,P){f.rect(0,0,240,24,P.blue);const now=s.now instanceof Date?s.now:new Date();const hh=String(now.getHours()).padStart(2,'0'),mm=String(now.getMinutes()).padStart(2,'0');f.text(3,4,'14',`${hh}:${mm}`,'#FFFFFF');if(s.cellular){for(let i=0;i<4;i++){const ht=4+i*3;f.roundRect(132+i*4,5+14-ht,3,ht,1,'#FFFFFF',null,0)}}if(s.bluetooth){const icon=RES()?.icons?.statusBt;if(icon)f.icon(150,4,icon,'#FFFFFF');else f.text(150,4,'14','B','#FFFFFF')}if(s.gps)f.icon(168,4,RES()?.icons?.gps,'#FFFFFF');f.icon(186,4,s.sound?RES()?.icons?.soundOn:RES()?.icons?.soundOff,'#FFFFFF');const bat=RES()?.icons?.battery?.[batteryIndex(s.battery)];if(bat)f.icon(205,5,bat,'#FFFFFF');else f.textRight(236,4,'14',`${s.battery}%`,'#FFFFFF')}
function nav(f,s,P,S){f.rect(0,288,240,32,P.panel);f.hline(0,288,240,P.grid);const names=s.language==='zh'?S.nav.labels:S.nav.labelsEn;for(let i=0;i<3;i++)f.textCenter(i*80,80,296,'16',names[i],i===s.page?P.blue:P.muted)}
function statusCard(f,s,r,title,k,l1,l2,P){card(f,r,P);f.text(r.x+6,r.y+4,'14',title,P.text);dot(f,r.x+(s.language==='en'?49:39),r.y+10,statusColor(s,k,P));f.textRight(r.x+105,r.y+4,'14',statusText(s,k),statusColor(s,k,P));f.text(r.x+6,r.y+27,'14',l1,P.muted);f.text(r.x+6,r.y+49,'14',l2,P.muted)}
function formatDose(v){if(v<1)return v.toFixed(3);if(v<100)return v.toFixed(2);return v.toFixed(1)}
function home(f,s,P,S){const oy=S.display.contentY;const host={...S.home.host,y:S.home.host.y+oy},probe={...S.home.probe,y:S.home.probe.y+oy},primary={...S.home.primary,y:S.home.primary.y+oy},total={...S.home.total,y:S.home.total.y+oy},count={...S.home.count,y:S.home.count.y+oy};statusCard(f,s,host,tx(s,'主机','Host'),s.host,tx(s,'温度 25.3 C','TEMP 25.3 C'),tx(s,'湿度 48.2%','HUM 48.2%'),P);statusCard(f,s,probe,tx(s,'探头','Probe'),s.probe,s.probeModel||'--',s.probe==='offline'?tx(s,'无探头','No probe'):tx(s,'GM剂量率探头','GM dose probe'),P);card(f,primary,P);f.text(primary.x+8,primary.y+6,'16',tx(s,'剂量率','DOSE RATE'),P.muted);f.textRight(primary.x+218,primary.y+6,'14',s.probe==='normal'?tx(s,'外部','External'):tx(s,'内部','Internal'),P.blue);const val=formatDose(s.dose),vw=f.textWidth('46',val);f.text(primary.x+10+Math.max(0,Math.floor((212-vw)/2)),primary.y+35,'46',val,P.cyan);f.textRight(primary.x+218,primary.y+76,'14','uSv/h',P.text);card(f,total,P);f.text(total.x+7,total.y+5,'14',tx(s,'累计剂量','TOTAL'),P.muted);f.text(total.x+7,total.y+25,'14',`${s.total.toFixed(3)} uSv`,P.text);f.text(total.x+7,total.y+47,'14','00:12:36',P.muted);card(f,count,P);f.text(count.x+7,count.y+5,'14',tx(s,'计数率','COUNT RATE'),P.muted);f.text(count.x+7,count.y+25,'14',`CPS ${s.cps.toFixed(1)}`,P.text);f.text(count.x+7,count.y+47,'14',`CPM ${s.cpm}`,P.text)}
function trend(f,s,P,S){const oy=S.display.contentY;f.text(8,oy+7,'16',tx(s,'60秒趋势','60 SECOND TREND'),P.text);f.textRight(232,oy+9,'14','uSv/h',P.muted);const r={...S.trend.chart,y:S.trend.chart.y+oy};f.rect(r.x,r.y,r.w,r.h,P.panel);f.frame(r.x,r.y,r.w,r.h,P.muted);for(let i=1;i<5;i++)f.hline(r.x,r.y+Math.floor(r.h*i/5),r.w,P.grid);for(let i=1;i<7;i++)f.vline(r.x+Math.floor(r.w*i/7),r.y,r.h,P.grid);const max=Math.max(S.trend.range,...s.trend)*1.2;if(s.trend.length){const step=r.w/s.trend.length,bw=Math.max(1,Math.floor(step-1));for(let i=0;i<s.trend.length;i++){const h=Math.max(1,Math.round((s.trend[i]/max)*(r.h-2))),x=r.x+Math.floor(i*step),y=r.y+r.h-1-h;f.rect(x,y,bw,h,P.blue)}}const vals=[Math.min(...s.trend),Math.round(s.trend.reduce((a,b)=>a+b,0)/s.trend.length),Math.max(...s.trend)],titles=[tx(s,'最小值','MIN'),tx(s,'平均值','AVG'),tx(s,'最大值','MAX')];for(let i=0;i<3;i++){const x=8+i*76;f.textCenter(x,72,oy+198,'14',titles[i],P.muted);f.textCenter(x,72,oy+219,'16',(vals[i]/100).toFixed(2),P.text)}f.text(8,oy+244,'14',tx(s,'每秒更新 · 最近60点','1 s update · latest 60'),P.muted)}
const ZH=['声音设置','按键声音','背光亮度','GM提示音','语言设置','日期时间','设备日志','设备信息','外接探头','4G设置','蓝牙设置','卫星定位设置','数据管理','清零累计','管理员设置','返回主界面'];
const EN=['Sound','Key sound','Backlight','GM tone','Language','Date and time','Device log','Device info','External probe','4G','Bluetooth','Satellite positioning','Data','Clear total','Administrator','Return to main'];
function settingValue(s,i){if(i===0)return s.sound?tx(s,'开启','ON'):tx(s,'静音','MUTE');if(i===1)return tx(s,'开启','ON');if(i===2)return '70%';if(i===3)return tx(s,'开启','ON');if(i===4)return s.language==='zh'?'中文':'EN';if(i===5)return `${String((s.now||new Date()).getHours()).padStart(2,'0')}:${String((s.now||new Date()).getMinutes()).padStart(2,'0')}`;if(i===9)return s.cellular?tx(s,'开启','ON'):tx(s,'关闭','OFF');if(i===10)return s.bluetooth?tx(s,'开启','ON'):tx(s,'关闭','OFF');if(i===11)return s.gps?tx(s,'开启','ON'):tx(s,'关闭','OFF');return '>'}
function settings(f,s,P,S){const oy=S.display.contentY,names=s.language==='zh'?ZH:EN;f.text(20,oy+4,'16',tx(s,'设置','SETTINGS'),P.text);f.roundRect(3,oy+27,5,231,2,P.grid,null,0);const thumbH=Math.floor(231*6/16),thumbY=oy+27+Math.floor((231-thumbH)*s.listFirst/10);f.roundRect(1,thumbY,9,thumbH,2,P.blue,null,0);for(let row=0;row<6;row++){const i=s.listFirst+row;if(i>=16)break;const base=S.settings.rows,r={x:base.x,y:oy+base.y+row*base.gap,w:base.w,h:base.h};card(f,r,P,i===s.selected?P.blue:P.grid,i===s.selected?2:1);f.text(r.x+8,r.y+9,'14',names[i],P.text);f.textRight(r.x+r.w-8,r.y+9,'14',settingValue(s,i),P.muted)}}
function render(canvas,s,S){if(!RES()?.fonts){throw new Error('DGN production font resources are missing. Run npm run build:resources.')}const P=S.palette,f=new Framebuffer(canvas);f.clear(P.bg);header(f,s,P);if(s.page===1)home(f,s,P,S);else if(s.page===2)trend(f,s,P,S);else settings(f,s,P,S);nav(f,s,P,S);f.present();return {resourceSource:RES().source}}
window.DGNProductionUI={render,ready:()=>!!RES()?.fonts};
})();

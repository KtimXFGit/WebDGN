(() => {
'use strict';
const P=window.DGNFramebufferPrimitives;
if(!P) throw new Error('dgn-framebuffer-core.js must load first');
const {RES,SPEC,PAL,clamp,Framebuffer,fnv1a16}=P;
function tx(s, zh, en) { return s.language === 'zh' ? zh : en; }
function statusColor(k) { return k === 'fault' ? PAL.red : k === 'alarm' ? PAL.yellow : k === 'normal' ? PAL.green : k === 'detect' ? PAL.blue : PAL.muted; }
function statusText(s, k) { return ({ normal: tx(s, '正常', 'Normal'), alarm: tx(s, '报警', 'Alarm'), fault: tx(s, '故障', 'Fault'), detect: tx(s, '识别中', 'Detect'), offline: tx(s, '未连接', 'Offline') })[k] || tx(s, '未连接', 'Offline'); }
function card(f, r, border = PAL.grid, width = 1) { f.roundRect(r.x, r.y, r.w, r.h, 4, PAL.panel, border, width); }
function dot(f, x, y, color) { f.rect(x, y, 6, 6, color); }
function drawHeader(f, s) {
  f.rect(0, 0, 240, 24, PAL.blue);
  const now = s.now instanceof Date ? s.now : new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  f.text(3, 4, '14', `${hh}:${mm}`, PAL.white);

  /*
   * Match ui_assets.c's fallback path exactly when the external resource bank
   * is not present in Git: 4G/BT/battery are LVGL labels; GPS/sound use the
   * compiled-in 16x16 A1 masks. Never synthesize a "close enough" icon.
   */
  if (s.cellular) f.text(132, 4, '14', '4G', PAL.white);
  if (s.bluetooth) f.text(150, 4, '14', 'B', PAL.white);
  if (s.gps) f.icon(168, 4, RES()?.icons?.gps, PAL.white);
  f.icon(186, 4, s.sound ? RES()?.icons?.soundOn : RES()?.icons?.soundOff, PAL.white);
  f.text(205, 4, '14', 'BAT', PAL.white);
}

function drawNav(f, s) {
  f.rect(0, 288, 240, 32, PAL.panel);
  f.hline(0, 288, 240, PAL.grid);
  const names = s.language === 'zh' ? SPEC.nav.labels : SPEC.nav.labelsEn;
  for (let i = 0; i < 3; i++) f.textCenter(i * 80, 80, 296, '16', names[i], i === s.page ? PAL.blue : PAL.muted);
}

function statusCard(f, s, r, title, kind, l1, l2) {
  card(f, r);
  f.text(r.x + 6, r.y + 4, '14', title, PAL.text);
  dot(f, r.x + (s.language === 'en' ? 49 : 39), r.y + 10, statusColor(kind));
  f.textRight(r.x + 105, r.y + 4, '14', statusText(s, kind), statusColor(kind));
  f.text(r.x + 6, r.y + 27, '14', l1, PAL.muted);
  f.text(r.x + 6, r.y + 49, '14', l2, PAL.muted);
}

function formatDose(v) { if (v < 1) return v.toFixed(3); if (v < 100) return v.toFixed(2); return v.toFixed(1); }

function drawHome(f, s) {
  const oy = SPEC.display.contentY;
  const shift = r => ({ ...r, y: r.y + oy });
  const host = shift(SPEC.home.host), probe = shift(SPEC.home.probe), primary = shift(SPEC.home.primary), total = shift(SPEC.home.total), count = shift(SPEC.home.count);
  statusCard(f, s, host, tx(s, '主机', 'Host'), s.host || 'normal', tx(s, '温度 25.3 C', 'TEMP 25.3 C'), tx(s, '湿度 48.2%', 'HUM 48.2%'));
  statusCard(f, s, probe, tx(s, '探头', 'Probe'), s.probe || 'offline', s.probeModel || '--', s.probe === 'offline' ? tx(s, '无探头', 'No probe') : tx(s, 'GM剂量率探头', 'GM dose probe'));
  card(f, primary);
  f.text(primary.x + 8, primary.y + 6, '16', tx(s, '剂量率', 'DOSE RATE'), PAL.muted);
  f.textRight(primary.x + 218, primary.y + 6, '14', s.probe === 'normal' ? tx(s, '外部', 'External') : tx(s, '内部', 'Internal'), PAL.blue);
  const val = formatDose(Number(s.dose || 0));
  const vw = f.textWidth('46', val);
  f.text(primary.x + 10 + Math.max(0, Math.floor((212 - vw) / 2)), primary.y + 35, '46', val, PAL.cyan);
  f.textRight(primary.x + 218, primary.y + 76, '14', 'uSv/h', PAL.text);
  card(f, total);
  f.text(total.x + 7, total.y + 5, '14', tx(s, '累计剂量', 'TOTAL'), PAL.muted);
  f.text(total.x + 7, total.y + 25, '14', `${Number(s.total || 0).toFixed(3)} uSv`, PAL.text);
  f.text(total.x + 7, total.y + 47, '14', '00:12:36', PAL.muted);
  card(f, count);
  f.text(count.x + 7, count.y + 5, '14', tx(s, '计数率', 'COUNT RATE'), PAL.muted);
  f.text(count.x + 7, count.y + 25, '14', `CPS ${Number(s.cps || 0).toFixed(1)}`, PAL.text);
  f.text(count.x + 7, count.y + 47, '14', `CPM ${s.cpm || 0}`, PAL.text);
}

function drawTrend(f, s) {
  const oy = SPEC.display.contentY;
  f.text(8, oy + 7, '16', tx(s, '60秒趋势', '60 SECOND TREND'), PAL.text);
  f.textRight(232, oy + 9, '14', 'uSv/h', PAL.muted);
  const r = { ...SPEC.trend.chart, y: SPEC.trend.chart.y + oy };
  f.rect(r.x, r.y, r.w, r.h, PAL.panel);
  f.frame(r.x, r.y, r.w, r.h, PAL.muted);
  for (let i = 1; i < 5; i++) f.hline(r.x, r.y + Math.floor(r.h * i / 5), r.w, PAL.grid);
  for (let i = 1; i < 7; i++) f.vline(r.x + Math.floor(r.w * i / 7), r.y, r.h, PAL.grid);
  const trend = Array.isArray(s.trend) ? s.trend : [];
  const max = Math.max(SPEC.trend.range, ...(trend.length ? trend : [0])) * 1.2;
  if (trend.length) {
    const step = r.w / trend.length, bw = Math.max(1, Math.floor(step - 1));
    for (let i = 0; i < trend.length; i++) {
      const h = Math.max(1, Math.round((trend[i] / max) * (r.h - 2)));
      f.rect(r.x + Math.floor(i * step), r.y + r.h - 1 - h, bw, h, PAL.blue);
    }
    const vals = [Math.min(...trend), Math.round(trend.reduce((a, b) => a + b, 0) / trend.length), Math.max(...trend)];
    const titles = [tx(s, '最小值', 'MIN'), tx(s, '平均值', 'AVG'), tx(s, '最大值', 'MAX')];
    for (let i = 0; i < 3; i++) {
      const x = 8 + i * 76;
      f.textCenter(x, 72, oy + 198, '14', titles[i], PAL.muted);
      f.textCenter(x, 72, oy + 219, '16', (vals[i] / 100).toFixed(2), PAL.text);
    }
  }
  f.text(8, oy + 244, '14', tx(s, '每秒更新 · 最近60点', '1 s update · latest 60'), PAL.muted);
}

const SETTINGS_ZH = ['声音设置','按键声音','背光亮度','GM提示音','语言设置','日期时间','设备日志','设备信息','外接探头','4G设置','蓝牙设置','卫星定位设置','数据管理','清零累计','管理员设置','返回主界面'];
const SETTINGS_EN = ['Sound','Key sound','Backlight','GM tone','Language','Date and time','Device log','Device info','External probe','4G','Bluetooth','Satellite positioning','Data','Clear total','Administrator','Return to main'];
function settingValue(s, i) {
  if (i === 0) return s.sound ? tx(s, '开启', 'ON') : tx(s, '静音', 'MUTE');
  if (i === 1 || i === 3) return tx(s, '开启', 'ON');
  if (i === 2) return '70%';
  if (i === 4) return s.language === 'zh' ? '中文' : 'EN';
  if (i === 5) { const d = s.now || new Date(); return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; }
  if (i === 9) return s.cellular ? tx(s, '开启', 'ON') : tx(s, '关闭', 'OFF');
  if (i === 10) return s.bluetooth ? tx(s, '开启', 'ON') : tx(s, '关闭', 'OFF');
  if (i === 11) return s.gps ? tx(s, '开启', 'ON') : tx(s, '关闭', 'OFF');
  return '>';
}
function drawSettings(f, s) {
  const oy = SPEC.display.contentY, names = s.language === 'zh' ? SETTINGS_ZH : SETTINGS_EN;
  f.text(20, oy + 4, '16', tx(s, '设置', 'SETTINGS'), PAL.text);
  f.roundRect(3, oy + 27, 5, 231, 2, PAL.grid, null, 0);
  const first = clamp(s.listFirst || 0, 0, 10), selected = clamp(s.settingIndex || 0, 0, 15);
  const thumbH = Math.floor(231 * 6 / 16), thumbY = oy + 27 + Math.floor((231 - thumbH) * first / 10);
  f.roundRect(1, thumbY, 9, thumbH, 2, PAL.blue, null, 0);
  for (let row = 0; row < 6; row++) {
    const i = first + row;
    if (i >= names.length) break;
    const y = oy + 27 + row * 39;
    f.roundRect(20, y, 212, 36, 4, i === selected ? PAL.panel2 : PAL.panel, i === selected ? PAL.blue : PAL.grid, i === selected ? 2 : 1);
    f.text(28, y + 9, '14', names[i], i === selected ? PAL.blue : PAL.text);
    f.textRight(224, y + 9, '14', settingValue(s, i), i === selected ? PAL.blue : PAL.muted);
  }
}

let lastFramebuffer = null;
let lastHash = null;
function render(state, canvas) {
  const f = new Framebuffer(canvas);
  f.clear(PAL.bg);
  drawHeader(f, state);
  const p = Number(state.page || 0);
  if (p === 0) drawSettings(f, state);
  else if (p === 2) drawTrend(f, state);
  else drawHome(f, state);
  drawNav(f, state);
  f.present();
  lastFramebuffer = f.data.slice();
  lastHash = fnv1a16(lastFramebuffer);
  return {
    framebufferFormat: 'LVGL_RGB565_SWAP16',
    framebufferHash: lastHash,
    sourceCommit: RES()?.sourceCommit || null,
    resourceSource: RES()?.generator || 'missing'
  };
}

function hitTest(state, x, y) {
  if (y >= 288) {
    const p = clamp(Math.floor(x / 80), 0, 2);
    state.page = p;
    return true;
  }
  if (state.page === 0 && x >= 20 && x < 232 && y >= 51 && y < 285) {
    const row = clamp(Math.floor((y - 51) / 39), 0, 5);
    state.settingIndex = clamp((state.listFirst || 0) + row, 0, 15);
    return true;
  }
  return false;
}

function keyDown(state, key) {
  if (key === 'ArrowLeft') { state.page = (Number(state.page || 0) + 2) % 3; return true; }
  if (key === 'ArrowRight') { state.page = (Number(state.page || 0) + 1) % 3; return true; }
  if (state.page === 0 && (key === 'ArrowUp' || key === 'ArrowDown')) {
    const d = key === 'ArrowUp' ? -1 : 1;
    state.settingIndex = clamp((state.settingIndex || 0) + d, 0, 15);
    if (state.settingIndex < (state.listFirst || 0)) state.listFirst = state.settingIndex;
    if (state.settingIndex > (state.listFirst || 0) + 5) state.listFirst = state.settingIndex - 5;
    state.listFirst = clamp(state.listFirst || 0, 0, 10);
    return true;
  }
  return false;
}

window.DGNProductionUI=Object.freeze({
  render,hitTest,keyDown,
  framebufferFormat:'LVGL_RGB565_SWAP16',
  getFramebuffer:()=>lastFramebuffer?lastFramebuffer.slice():null,
  getFramebufferHash:()=>lastHash
});
})();

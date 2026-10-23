(() => {
'use strict';
const C=window.DGNFramebufferCodec;
if(!C) throw new Error('dgn-framebuffer-codec.js must load first');
const {W,H,RES,hexToLv565,lvColorMix16,lv565ToRgb888,decodeGlyph,b64}=C;
const SPEC = Object.freeze({
  display: { contentY: 24, navHeight: 26 },
  home: {
    status: { x: 6, y: 4, w: 228, h: 26 },
    logScale: { x: 6, y: 36, w: 42, h: 168 },
    primary: { x: 54, y: 36, w: 180, h: 168 },
    total: { x: 6, y: 216, w: 228, h: 48 }
  },
  typography: { primaryScale: 1.18 },
  trend: { chart: { x: 30, y: 36, w: 198, h: 138 }, range: 50 },
  nav: { labels: ['设置', '测量', '趋势'], labelsEn: ['SET', 'MEASURE', 'TREND'] }
});

const PAL = Object.freeze({
  bg: '#F3F7FC', bar: '#FFFFFF', panel: '#FFFFFF', panel2: '#E8F2FF',
  cyan: '#1677D2', blue: '#0B5CAD', green: '#1F8E5A', yellow: '#B87500',
  red: '#C73745', violet: '#5B67D6', text: '#17324D', muted: '#5E7892',
  grid: '#B8CCE5', off: '#9AAFC3', white: '#FFFFFF'
});

class Framebuffer {
  constructor(canvas) {
    this.canvas = canvas || null;
    this.ctx = canvas ? canvas.getContext('2d', { alpha: false }) : null;
    this.data = new Uint16Array(W * H);
  }
  clear(color) { this.data.fill(hexToLv565(color)); }
  pixel(x, y, color, opa = 255) {
    x |= 0; y |= 0;
    if (x < 0 || x >= W || y < 0 || y >= H || opa <= 0) return;
    const idx = y * W + x;
    const src = typeof color === 'number' ? color : hexToLv565(color);
    this.data[idx] = opa >= 255 ? src : lvColorMix16(src, this.data[idx], opa);
  }
  rect(x, y, w, h, color) {
    const c = typeof color === 'number' ? color : hexToLv565(color);
    x |= 0; y |= 0; w |= 0; h |= 0;
    for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) this.pixel(x + xx, y + yy, c);
  }
  hline(x, y, w, color) { for (let i = 0; i < w; i++) this.pixel(x + i, y, color); }
  vline(x, y, h, color) { for (let i = 0; i < h; i++) this.pixel(x, y + i, color); }
  frame(x, y, w, h, color, width = 1) {
    for (let i = 0; i < width; i++) {
      this.hline(x + i, y + i, w - i * 2, color);
      this.hline(x + i, y + h - 1 - i, w - i * 2, color);
      this.vline(x + i, y + i, h - i * 2, color);
      this.vline(x + w - 1 - i, y + i, h - i * 2, color);
    }
  }
  insideRound(xx, yy, w, h, r) {
    if (r <= 0) return xx >= 0 && yy >= 0 && xx < w && yy < h;
    if (xx < 0 || yy < 0 || xx >= w || yy >= h) return false;
    const cx = xx < r ? r - 0.5 : (xx >= w - r ? w - r - 0.5 : xx);
    const cy = yy < r ? r - 0.5 : (yy >= h - r ? h - r - 0.5 : yy);
    const dx = xx - cx, dy = yy - cy;
    return (xx >= r && xx < w - r) || (yy >= r && yy < h - r) || dx * dx + dy * dy <= r * r;
  }
  roundRect(x, y, w, h, r, bg, border, bw = 1) {
    for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
      if (!this.insideRound(xx, yy, w, h, r)) continue;
      let c = bg;
      if (border && bw) {
        const iw = w - 2 * bw, ih = h - 2 * bw, ir = Math.max(0, r - bw);
        if (iw <= 0 || ih <= 0 || !this.insideRound(xx - bw, yy - bw, iw, ih, ir)) c = border;
      }
      this.pixel(x + xx, y + yy, c);
    }
  }
  line(x0, y0, x1, y1, color) {
    x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0;
    let dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
    let dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
    let e = dx + dy;
    for (;;) {
      this.pixel(x0, y0, color);
      if (x0 === x1 && y0 === y1) break;
      const e2 = e * 2;
      if (e2 >= dy) { e += dy; x0 += sx; }
      if (e2 <= dx) { e += dx; y0 += sy; }
    }
  }
  glyph(x, y, fontKey, cp, color) {
    const font = RES()?.fonts?.[fontKey];
    const glyph = font?.glyphs?.[String(cp)] || font?.glyphs?.['63'];
    if (!font || !glyph) return 0;
    const [adv, w, h, ox, oy] = glyph;
    if (!w || !h) return adv;
    const cov = decodeGlyph(fontKey, cp, font, glyph);
    const top = y + font.lineHeight - font.baseLine - h - oy;
    let p = 0;
    for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++, p++) {
      const a = cov[p];
      if (a) this.pixel(x + ox + xx, top + yy, color, a * 17);
    }
    return adv;
  }
  glyphScaled(x, y, fontKey, cp, color, scale = 1) {
    if (scale === 1) return this.glyph(x, y, fontKey, cp, color);
    const font = RES()?.fonts?.[fontKey];
    const glyph = font?.glyphs?.[String(cp)] || font?.glyphs?.['63'];
    if (!font || !glyph) return 0;
    const [adv, w, h, ox, oy] = glyph;
    if (!w || !h) return Math.round(adv * scale);
    const cov = decodeGlyph(fontKey, cp, font, glyph);
    const dw = Math.max(1, Math.round(w * scale));
    const dh = Math.max(1, Math.round(h * scale));
    const dx0 = x + Math.round(ox * scale);
    const topOffset = font.lineHeight - font.baseLine - h - oy;
    const dy0 = y + Math.round(topOffset * scale);
    for (let dy = 0; dy < dh; dy++) {
      const sy = Math.min(h - 1, Math.floor(dy / scale));
      for (let dx = 0; dx < dw; dx++) {
        const sx = Math.min(w - 1, Math.floor(dx / scale));
        const a = cov[sy * w + sx];
        if (a) this.pixel(dx0 + dx, dy0 + dy, color, a * 17);
      }
    }
    return Math.round(adv * scale);
  }
  textWidth(fontKey, text) {
    const f = RES()?.fonts?.[fontKey];
    if (!f) return 0;
    let width = 0;
    for (const ch of String(text)) {
      const g = f.glyphs[String(ch.codePointAt(0))] || f.glyphs['63'];
      if (g) width += g[0];
    }
    return width;
  }
  textWidthScaled(fontKey, text, scale = 1) {
    return Math.round(this.textWidth(fontKey, text) * scale);
  }
  text(x, y, fontKey, text, color) {
    let p = x;
    for (const ch of String(text)) p += this.glyph(p, y, fontKey, ch.codePointAt(0), color);
    return p - x;
  }
  textScaled(x, y, fontKey, text, color, scale = 1) {
    let p = x;
    for (const ch of String(text)) p += this.glyphScaled(p, y, fontKey, ch.codePointAt(0), color, scale);
    return p - x;
  }
  textRight(right, y, fontKey, text, color) { return this.text(right - this.textWidth(fontKey, text), y, fontKey, text, color); }
  textCenter(left, width, y, fontKey, text, color) {
    const tw = this.textWidth(fontKey, text);
    return this.text(left + Math.max(0, Math.floor((width - tw) / 2)), y, fontKey, text, color);
  }
  textCenterScaled(left, width, y, fontKey, text, color, scale = 1) {
    const tw = this.textWidthScaled(fontKey, text, scale);
    return this.textScaled(left + Math.max(0, Math.floor((width - tw) / 2)), y, fontKey, text, color, scale);
  }
  icon(x, y, icon, color) {
    if (!icon) return;
    const bytes = b64(icon.data);
    if (icon.bpp === 1) {
      const stride = Math.ceil(icon.w / 8);
      for (let yy = 0; yy < icon.h; yy++) for (let xx = 0; xx < icon.w; xx++) {
        if (bytes[yy * stride + (xx >>> 3)] & (0x80 >>> (xx & 7))) this.pixel(x + xx, y + yy, color);
      }
    } else {
      let i = 0;
      for (let yy = 0; yy < icon.h; yy++) for (let xx = 0; xx < icon.w; xx++, i++) {
        const v = (i & 1) ? (bytes[i >>> 1] & 15) : (bytes[i >>> 1] >>> 4);
        if (v) this.pixel(x + xx, y + yy, color, v * 17);
      }
    }
  }
  present() {
    if (!this.ctx) return;
    const rgba = new Uint8ClampedArray(W * H * 4);
    for (let i = 0; i < this.data.length; i++) {
      const [r, g, b] = lv565ToRgb888(this.data[i]);
      const p = i * 4;
      rgba[p] = r; rgba[p + 1] = g; rgba[p + 2] = b; rgba[p + 3] = 255;
    }
    const img = typeof ImageData !== 'undefined' ? new ImageData(rgba, W, H) : this.ctx.createImageData(W, H);
    if (img.data !== rgba) img.data.set(rgba);
    this.ctx.imageSmoothingEnabled = false;
    this.ctx.putImageData(img, 0, 0);
  }
}

window.DGNFramebufferPrimitives=Object.freeze({...C,SPEC,PAL,Framebuffer});
})();

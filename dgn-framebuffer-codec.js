(() => {
'use strict';

/* DGN_01 LVGL 8.3.11 RGB565 + compiled-font codec. */
const W=240,H=320,LV_COLOR_16_SWAP=1;
const RES=()=>window.DGNProductionResources;
const byteCache=new Map(),glyphCache=new Map(),colorCache=new Map();
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function swap16(v) { return ((v >>> 8) | ((v & 0xff) << 8)) & 0xffff; }

function hexToLv565(hex) {
  const key = typeof hex === 'number' ? hex : String(hex).toUpperCase();
  if (colorCache.has(key)) return colorCache.get(key);
  let n;
  if (typeof hex === 'number') n = hex >>> 0;
  else n = parseInt(String(hex).replace('#', ''), 16) >>> 0;
  const r = (n >>> 16) & 0xff;
  const g = (n >>> 8) & 0xff;
  const b = n & 0xff;
  const native565 = (((r >>> 3) << 11) | ((g >>> 2) << 5) | (b >>> 3)) & 0xffff;
  const stored = LV_COLOR_16_SWAP ? swap16(native565) : native565;
  colorCache.set(key, stored);
  return stored;
}

/* Mirrors lv_color_mix() for LV_COLOR_DEPTH == 16 and LV_COLOR_16_SWAP == 1. */
function lvColorMix16(c1Stored, c2Stored, mix) {
  mix = clamp(mix | 0, 0, 255);
  if (mix === 255) return c1Stored & 0xffff;
  if (mix === 0) return c2Stored & 0xffff;

  let c1 = LV_COLOR_16_SWAP ? swap16(c1Stored) : (c1Stored & 0xffff);
  let c2 = LV_COLOR_16_SWAP ? swap16(c2Stored) : (c2Stored & 0xffff);
  const m = (mix + 4) >>> 3; // LVGL: 0..32

  const bg = ((c2 | ((c2 << 16) >>> 0)) >>> 0) & 0x07E0F81F;
  const fg = ((c1 | ((c1 << 16) >>> 0)) >>> 0) & 0x07E0F81F;
  const delta = (fg - bg) >>> 0;
  let result = ((((Math.imul(delta, m) >>> 0) >>> 5) + bg) >>> 0) & 0x07E0F81F;
  result = (result | (result >>> 16)) >>> 0;
  const native565 = result & 0xffff;
  return LV_COLOR_16_SWAP ? swap16(native565) : native565;
}

function lv565ToRgb888(stored) {
  const p = LV_COLOR_16_SWAP ? swap16(stored) : (stored & 0xffff);
  const r5 = (p >>> 11) & 0x1f;
  const g6 = (p >>> 5) & 0x3f;
  const b5 = p & 0x1f;
  // Same integer expansion used by lv_color_to32() for 16-bit colors.
  return [
    ((r5 * 263 + 7) >>> 5) & 0xff,
    ((g6 * 259 + 3) >>> 6) & 0xff,
    ((b5 * 263 + 7) >>> 5) & 0xff
  ];
}

function b64(s) {
  if (!s) return new Uint8Array(0);
  let out = byteCache.get(s);
  if (out) return out;
  const raw = atob(s);
  out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  byteCache.set(s, out);
  return out;
}

function getBits(bytes, bitPos, len) {
  const mask = len === 8 ? 0xff : ((1 << len) - 1);
  const bytePos = bitPos >>> 3;
  const inByte = bitPos & 7;
  if (inByte + len >= 8) {
    const a = bytes[bytePos] || 0;
    const b = bytes[bytePos + 1] || 0;
    const in16 = (a << 8) | b;
    return (in16 >>> (16 - inByte - len)) & mask;
  }
  return ((bytes[bytePos] || 0) >>> (8 - inByte - len)) & mask;
}

/*
 * Exact state machine from LVGL 8.3.x lv_font_fmt_txt.c:rle_next().
 * Returns one bpp sample per call. The browser intentionally decodes the
 * original compiled glyph byte stream instead of a Web-predecoded bitmap.
 */
function createRleReader(bytes, bpp) {
  const SINGLE = 0, REPEAT = 1, COUNTER = 2;
  let state = SINGLE;
  let rdp = 0;
  let prev = 0;
  let cnt = 0;
  return function next() {
    let v = 0;
    let ret = 0;
    if (state === SINGLE) {
      ret = getBits(bytes, rdp, bpp);
      if (rdp !== 0 && prev === ret) {
        cnt = 0;
        state = REPEAT;
      }
      prev = ret;
      rdp += bpp;
    } else if (state === REPEAT) {
      v = getBits(bytes, rdp, 1);
      cnt++;
      rdp += 1;
      if (v === 1) {
        ret = prev;
        if (cnt === 11) {
          cnt = getBits(bytes, rdp, 6);
          rdp += 6;
          if (cnt !== 0) {
            state = COUNTER;
          } else {
            ret = getBits(bytes, rdp, bpp);
            prev = ret;
            rdp += bpp;
            state = SINGLE;
          }
        }
      } else {
        ret = getBits(bytes, rdp, bpp);
        prev = ret;
        rdp += bpp;
        state = SINGLE;
      }
    } else {
      ret = prev;
      cnt--;
      if (cnt === 0) {
        ret = getBits(bytes, rdp, bpp);
        prev = ret;
        rdp += bpp;
        state = SINGLE;
      }
    }
    return ret;
  };
}

function decodeGlyph(fontKey, cp, font, glyph) {
  const cacheKey = `${fontKey}:${cp}`;
  const cached = glyphCache.get(cacheKey);
  if (cached) return cached;

  const [, w, h, , , payload] = glyph;
  const total = w * h;
  const out = new Uint8Array(total);
  if (!total) {
    glyphCache.set(cacheKey, out);
    return out;
  }

  const bytes = b64(payload);
  const bpp = font.bpp || 4;
  const format = font.bitmapFormat | 0;

  if (format === 0) {
    // Uncompressed LVGL bitmap: MSB first, tightly packed.
    let bit = 0;
    for (let i = 0; i < total; i++, bit += bpp) out[i] = getBits(bytes, bit, bpp);
  } else {
    const next = createRleReader(bytes, bpp);
    let prevLine = null;
    for (let y = 0; y < h; y++) {
      const line = new Uint8Array(w);
      for (let x = 0; x < w; x++) line[x] = next();
      // LV_FONT_FMT_TXT_COMPRESSED uses the XOR line prefilter.
      if (format === 1 && prevLine) {
        for (let x = 0; x < w; x++) line[x] ^= prevLine[x];
      }
      out.set(line, y * w);
      prevLine = line;
    }
  }

  glyphCache.set(cacheKey, out);
  return out;
}

function fnv1a16(buf) {
  let h = 0x811c9dc5;
  for (let i = 0; i < buf.length; i++) {
    const v = buf[i];
    h ^= v & 0xff; h = Math.imul(h, 0x01000193) >>> 0;
    h ^= (v >>> 8) & 0xff; h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

window.DGNFramebufferCodec=Object.freeze({W,H,LV_COLOR_16_SWAP,RES,clamp,swap16,hexToLv565,lvColorMix16,lv565ToRgb888,b64,getBits,createRleReader,decodeGlyph,fnv1a16});
})();

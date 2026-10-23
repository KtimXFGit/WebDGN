#!/usr/bin/env python3
"""Build WebDGN production resources from DGN_01's *compiled LVGL C assets*.

No font regeneration is performed here.  The authoritative inputs are the
three ui_font_*.c files already committed to the pinned DGN_01 revision.
Glyph payloads are copied byte-for-byte (compressed or raw) so the browser can
run the same LVGL RLE/prefilter decoder as the target.
"""
from __future__ import annotations

import base64
import hashlib
import json
import re
import urllib.request
from pathlib import Path

SOURCE_REPO = "KtimXFGit/DGN_01"
SOURCE_SHA = "291d4fb201a647f128c02f9e916b057a266e600a"
RAW_ROOT = f"https://raw.githubusercontent.com/{SOURCE_REPO}/{SOURCE_SHA}/"
OUT = Path(__file__).resolve().parents[1] / "ui-resource" / "dgn-production-resources.js"

FONT_SOURCES = {
    "14": {
        "path": "1_Application/User/UI/Fonts/ui_font_dgn_14.c",
        "blob": "3b52e56f6d120f83c078566b3074d9d3293f46b9",
    },
    "16": {
        "path": "1_Application/User/UI/Fonts/ui_font_dgn_16.c",
        "blob": "0b952f3eb74de851c9da75911cf4dc7aa75a55b3",
    },
    "46": {
        "path": "1_Application/User/UI/Fonts/ui_font_dose_46.c",
        "blob": "ac5a5bd836927007530611ea294d54ff67a086c9",
    },
}

ASSET_SOURCE = "1_Application/User/UI/ui_assets.c"


def fetch(path: str) -> bytes:
    req = urllib.request.Request(RAW_ROOT + path, headers={"User-Agent": "WebDGN-resource-builder"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def git_blob_sha(data: bytes) -> str:
    head = f"blob {len(data)}\0".encode("ascii")
    return hashlib.sha1(head + data).hexdigest()


def require_blob(data: bytes, expected: str, path: str) -> None:
    actual = git_blob_sha(data)
    if actual != expected:
        raise RuntimeError(f"{path}: Git blob SHA mismatch: {actual} != {expected}")


def parse_ints(body: str) -> list[int]:
    return [int(x, 0) for x in re.findall(r"(?<![\w.])-?0x[0-9A-Fa-f]+|(?<![\w.])-?\d+", body)]


def array_body(text: str, name: str) -> str:
    m = re.search(rf"\b{name}\s*\[\]\s*=\s*\{{(.*?)\n\}};", text, re.S)
    if not m:
        raise RuntimeError(f"array not found: {name}")
    return m.group(1)


def parse_font(data: bytes, source_path: str, blob_sha: str) -> dict:
    text = data.decode("utf-8")
    bitmap_body = array_body(text, "glyph_bitmap")
    bitmap = bytes(parse_ints(re.sub(r"/\*.*?\*/", "", bitmap_body, flags=re.S)))

    # Generated files put one U+ comment before every bitmap glyph in glyph-id order.
    cps = [int(x, 16) for x in re.findall(r"/\*\s*U\+([0-9A-Fa-f]{4,6})\b", bitmap_body)]

    dsc_body = array_body(text, "glyph_dsc")
    desc_re = re.compile(
        r"\{\s*\.bitmap_index\s*=\s*(\d+)\s*,\s*\.adv_w\s*=\s*(\d+)\s*,\s*"
        r"\.box_w\s*=\s*(\d+)\s*,\s*\.box_h\s*=\s*(\d+)\s*,\s*"
        r"\.ofs_x\s*=\s*(-?\d+)\s*,\s*\.ofs_y\s*=\s*(-?\d+)\s*\}", re.S)
    desc = [tuple(map(int, m.groups())) for m in desc_re.finditer(dsc_body)]
    if len(desc) < 2:
        raise RuntimeError(f"{source_path}: no glyph descriptors parsed")
    # glyph_dsc[0] is the reserved id; bitmap comments start at glyph id 1.
    if len(cps) != len(desc) - 1:
        raise RuntimeError(f"{source_path}: bitmap comments ({len(cps)}) != descriptors-1 ({len(desc)-1})")

    bpp_m = re.search(r"\.bpp\s*=\s*(\d+)", text)
    fmt_m = re.search(r"\.bitmap_format\s*=\s*([A-Za-z0-9_]+)", text)
    line_m = re.search(r"\.line_height\s*=\s*(\d+)", text)
    base_m = re.search(r"\.base_line\s*=\s*(-?\d+)", text)
    if not (bpp_m and fmt_m and line_m and base_m):
        raise RuntimeError(f"{source_path}: font metadata not found")

    fmt_token = fmt_m.group(1)
    fmt = {
        "0": 0,
        "LV_FONT_FMT_TXT_PLAIN": 0,
        "LV_FONT_FMT_TXT_COMPRESSED": 1,
        "LV_FONT_FMT_TXT_COMPRESSED_NO_PREFILTER": 2,
    }.get(fmt_token)
    if fmt is None:
        # Generated files sometimes emit the numeric macro expansion.
        if fmt_token.isdigit(): fmt = int(fmt_token)
        else: raise RuntimeError(f"{source_path}: unknown bitmap_format {fmt_token}")

    glyphs: dict[str, list] = {}
    for i, cp in enumerate(cps, start=1):
        bitmap_index, adv_w, w, h, ox, oy = desc[i]
        next_index = desc[i + 1][0] if i + 1 < len(desc) else len(bitmap)
        payload = bitmap[bitmap_index:next_index]
        # LVGL adv_w is 1/16 px in generated format. UI positions are integer px.
        adv_px = (adv_w + 8) >> 4
        glyphs[str(cp)] = [
            adv_px, w, h, ox, oy,
            base64.b64encode(payload).decode("ascii"),
        ]

    return {
        "lineHeight": int(line_m.group(1)),
        "baseLine": int(base_m.group(1)),
        "bpp": int(bpp_m.group(1)),
        "bitmapFormat": fmt,
        "payloadEncoding": "native-lvgl-glyph-bytes",
        "sourcePath": source_path,
        "gitBlobSha": blob_sha,
        "glyphCount": len(glyphs),
        "glyphs": glyphs,
    }


def extract_builtin_icons(text: str) -> dict:
    """Parse the exact 1bpp built-in masks from DGN_01 ui_assets.c.

    At SOURCE_SHA only GPS and SOUND have compiled-in image fallbacks. 4G,
    Bluetooth and battery fall back to LVGL text labels when the external
    resource bank is unavailable, so WebDGN must not invent replacement icons.
    """
    aliases = {
        "gps": ("UI_GPS_BITMAP", 16, 16),
        "soundOn": ("UI_SOUND_BITMAP", 16, 16),
    }
    result = {}
    for out_name, (c_name, w, h) in aliases.items():
        m = re.search(rf"\b{re.escape(c_name)}\s*\[.*?\]\s*=\s*\{{(.*?)\}};", text, re.S)
        if not m:
            raise RuntimeError(f"{ASSET_SOURCE}: built-in icon not found: {c_name}")
        raw = bytes(parse_ints(re.sub(r"/\*.*?\*/", "", m.group(1), flags=re.S)))
        expected = ((w + 7) // 8) * h
        if len(raw) != expected:
            raise RuntimeError(f"{ASSET_SOURCE}: {c_name} size {len(raw)} != {expected}")
        result[out_name] = {
            "w": w,
            "h": h,
            "bpp": 1,
            "data": base64.b64encode(raw).decode("ascii"),
            "origin": f"{ASSET_SOURCE}@{SOURCE_SHA}",
        }
    # ui_assets.c uses the same compiled-in speaker mask for the sound state;
    # state/color controls the presentation when the external icon is absent.
    result["soundOff"] = dict(result["soundOn"])
    return result


def main() -> None:
    fonts = {}
    for key, meta in FONT_SOURCES.items():
        raw = fetch(meta["path"])
        require_blob(raw, meta["blob"], meta["path"])
        fonts[key] = parse_font(raw, meta["path"], meta["blob"])

    asset_raw = fetch(ASSET_SOURCE)
    asset_text = asset_raw.decode("utf-8")
    icons = extract_builtin_icons(asset_text)

    payload = {
        "schema": 2,
        "sourceRepo": SOURCE_REPO,
        "sourceCommit": SOURCE_SHA,
        "generator": "exact-compiled-lvgl-c-assets; browser decodes native LVGL glyph payload",
        "framebufferContract": {"colorDepth":16,"color16Swap":1,"glyphOpacity":"4bpp x 17"},
        "externalIconBank": {
            "availableInGit": False,
            "behavior": "use ui_assets.c compiled-in/text fallbacks; do not synthesize icons",
        },
        "fonts": fonts,
        "icons": icons,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        "/* Generated. Do not hand-edit. Source is pinned DGN_01 compiled UI assets. */\n"
        "window.DGNProductionResources = " + json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + ";\n",
        encoding="utf-8",
    )
    print(f"Wrote {OUT}")
    for k,f in fonts.items():
        print(f"font {k}: {f['glyphCount']} glyphs, bitmapFormat={f['bitmapFormat']}, blob={f['gitBlobSha']}")


if __name__ == "__main__":
    main()

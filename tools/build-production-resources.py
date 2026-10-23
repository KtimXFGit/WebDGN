#!/usr/bin/env python3
"""Build WebDGN font/icon resources from the exact DGN_01 production inputs.

The pipeline reproduces DGN_01's three linked LVGL fonts with lv_font_conv 1.5.3,
verifies the pinned source font hashes, decodes LVGL's 4-bpp lossless RLE using
the same algorithm as lv_font_fmt_txt.c, and emits compact browser resources.
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import json
import re
import shutil
import subprocess
import tempfile
import urllib.request
from pathlib import Path

from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / "ui_font_charsets.json"
OUT = ROOT / "ui-resource" / "dgn-production-resources.js"
CACHE = ROOT / ".cache" / "fonts"
DGN_COMMIT = "291d4fb201a647f128c02f9e916b057a266e600a"
LV_FONT_CONV_VERSION = "1.5.3"

NOTO_URL = "https://raw.githubusercontent.com/Auuueser/LC-Chinese-Project/e9ce4920627389fc772837acf2d220a034bc0e98/fonts/NotoSansSC-VF.ttf"
NOTO_SHA256 = "763146584CF0710223441356B4395E279021B0806C196614377A7A0174AE074A"
MONTSERRAT_URL = "https://raw.githubusercontent.com/lvgl/lvgl/v8.3.11/scripts/built_in_font/Montserrat-Medium.ttf"
MONTSERRAT_SHA256 = "421F26B23E2BE6B98373D32ACD3CB2897B154D4BF0A77D26534CE476E4CBED53"


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest().upper()


def fetch(url: str, dest: Path, expected: str) -> Path:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and sha256(dest) == expected:
        return dest
    with urllib.request.urlopen(url, timeout=120) as response:
        dest.write_bytes(response.read())
    digest = sha256(dest)
    if digest != expected:
        dest.unlink(missing_ok=True)
        raise SystemExit(f"source font hash mismatch for {url}: {digest}")
    return dest


def converter_path() -> Path:
    candidates = [
        ROOT / "node_modules" / ".bin" / "lv_font_conv",
        ROOT / "node_modules" / ".bin" / "lv_font_conv.cmd",
    ]
    for candidate in candidates:
        if candidate.exists():
            return candidate
    found = shutil.which("lv_font_conv")
    if found:
        return Path(found)
    raise SystemExit("lv_font_conv 1.5.3 not installed; run npm install")


def generate_font(font: Path, size: int, symbols: str, name: str,
                  out_dir: Path, include_ascii: bool) -> Path:
    command = [str(converter_path()), "--size", str(size), "--bpp", "4",
               "--format", "lvgl", "--font", str(font)]
    if include_ascii:
        command.extend(["--range", "0x20-0x7E"])
    command.extend(["--symbols", symbols, "--no-kerning",
                    "--lv-include", "lvgl.h", "--lv-font-name", name,
                    "-o", str(out_dir / f"{name}.c")])
    subprocess.run(command, check=True)
    return out_dir / f"{name}.c"


def get_bits(data: bytes, bit_pos: int, length: int) -> int:
    mask = (1 << length) - 1
    byte_pos = bit_pos >> 3
    offset = bit_pos & 7
    if offset + length >= 8:
        a = data[byte_pos] if byte_pos < len(data) else 0
        b = data[byte_pos + 1] if byte_pos + 1 < len(data) else 0
        value = (a << 8) | b
        return (value >> (16 - offset - length)) & mask
    a = data[byte_pos] if byte_pos < len(data) else 0
    return (a >> (8 - offset - length)) & mask


class RLE:
    SINGLE = 0
    REPEAT = 1
    COUNTER = 2

    def __init__(self, data: bytes, bpp: int):
        self.data = data
        self.bpp = bpp
        self.state = self.SINGLE
        self.rdp = 0
        self.prev = 0
        self.count = 0

    def next(self) -> int:
        ret = 0
        if self.state == self.SINGLE:
            ret = get_bits(self.data, self.rdp, self.bpp)
            if self.rdp != 0 and self.prev == ret:
                self.count = 0
                self.state = self.REPEAT
            self.prev = ret
            self.rdp += self.bpp
        elif self.state == self.REPEAT:
            v = get_bits(self.data, self.rdp, 1)
            self.count += 1
            self.rdp += 1
            if v == 1:
                ret = self.prev
                if self.count == 11:
                    self.count = get_bits(self.data, self.rdp, 6)
                    self.rdp += 6
                    if self.count != 0:
                        self.state = self.COUNTER
                    else:
                        ret = get_bits(self.data, self.rdp, self.bpp)
                        self.prev = ret
                        self.rdp += self.bpp
                        self.state = self.SINGLE
            else:
                ret = get_bits(self.data, self.rdp, self.bpp)
                self.prev = ret
                self.rdp += self.bpp
                self.state = self.SINGLE
        else:
            ret = self.prev
            self.count -= 1
            if self.count == 0:
                ret = get_bits(self.data, self.rdp, self.bpp)
                self.prev = ret
                self.rdp += self.bpp
                self.state = self.SINGLE
        return ret


def decompress(data: bytes, width: int, height: int, bpp: int = 4,
               prefilter: bool = True) -> list[int]:
    rle = RLE(data, bpp)
    rows: list[list[int]] = []
    first = [rle.next() for _ in range(width)]
    rows.append(first)
    prev = first
    for _ in range(1, height):
        current = [rle.next() for _ in range(width)]
        if prefilter:
            current = [a ^ b for a, b in zip(current, prev)]
        rows.append(current)
        prev = current
    return [pixel for row in rows for pixel in row]


def pack4(values: list[int]) -> bytes:
    result = bytearray((len(values) + 1) // 2)
    for index, value in enumerate(values):
        value &= 0xF
        if index & 1:
            result[index >> 1] |= value
        else:
            result[index >> 1] = value << 4
    return bytes(result)


def parse_font(path: Path) -> dict:
    source = path.read_text(encoding="utf-8")
    bitmap_match = re.search(r"glyph_bitmap\[\]\s*=\s*\{(.*?)\n\};", source, re.S)
    dsc_match = re.search(r"glyph_dsc\[\]\s*=\s*\{(.*?)\n\};", source, re.S)
    if not bitmap_match or not dsc_match:
        raise ValueError(f"unable to parse {path}")

    blocks = []
    pattern = re.compile(r'/\*\s*U\+([0-9A-Fa-f]+).*?\*/(.*?)(?=/\*\s*U\+|\Z)', re.S)
    for match in pattern.finditer(bitmap_match.group(1)):
        cp = int(match.group(1), 16)
        payload = bytes(int(v, 16) for v in re.findall(r"0x([0-9A-Fa-f]+)", match.group(2)))
        blocks.append((cp, payload))

    descriptors = []
    dsc_re = re.compile(
        r"\.bitmap_index\s*=\s*(-?\d+).*?\.adv_w\s*=\s*(-?\d+).*?"
        r"\.box_w\s*=\s*(-?\d+).*?\.box_h\s*=\s*(-?\d+).*?"
        r"\.ofs_x\s*=\s*(-?\d+).*?\.ofs_y\s*=\s*(-?\d+)", re.S)
    for match in dsc_re.finditer(dsc_match.group(1)):
        descriptors.append(tuple(int(v) for v in match.groups()))
    if not descriptors or len(descriptors) - 1 != len(blocks):
        raise ValueError(f"glyph count mismatch in {path}: blocks={len(blocks)}, dsc={len(descriptors)}")

    line_height = int(re.search(r"\.line_height\s*=\s*(\d+)", source).group(1))
    base_line = int(re.search(r"\.base_line\s*=\s*(-?\d+)", source).group(1))
    bpp = int(re.search(r"\.bpp\s*=\s*(\d+)", source).group(1))
    bitmap_format = int(re.search(r"\.bitmap_format\s*=\s*(\d+)", source).group(1))
    glyphs = {}
    for index, (cp, payload) in enumerate(blocks, start=1):
        _, adv_w, box_w, box_h, ofs_x, ofs_y = descriptors[index]
        if box_w and box_h:
            pixels = decompress(payload, box_w, box_h, bpp, bitmap_format == 1)
            packed = base64.b64encode(pack4(pixels)).decode("ascii")
        else:
            packed = ""
        glyphs[str(cp)] = [
            (adv_w + 8) >> 4, box_w, box_h, ofs_x, ofs_y, packed
        ]
    return {"lineHeight": line_height, "baseLine": base_line, "bpp": bpp,
            "glyphs": glyphs}


def one_bit_icon(width: int, height: int, data: bytes) -> dict:
    return {"w": width, "h": height, "bpp": 1,
            "data": base64.b64encode(data).decode("ascii")}


def builtin_icons() -> dict:
    gps = bytes([
        0x00,0x00,0x07,0xC0,0x0F,0xE0,0x1F,0xF0,0x1C,0x70,0x18,0x30,0x18,0x30,0x1C,0x70,
        0x1F,0xF0,0x0F,0xE0,0x0F,0xE0,0x07,0xC0,0x03,0x80,0x03,0x80,0x01,0x00,0x00,0x00])
    sound_on = bytes([
        0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x80,0x01,0x90,0x07,0xA8,0x7F,0xA4,0x7F,0x94,
        0x7F,0x94,0x7F,0x94,0x7F,0xA4,0x07,0xA8,0x01,0x90,0x00,0x80,0x00,0x00,0x00,0x00])
    sound_off = bytes([
        0x00,0x00,0x20,0x00,0x10,0x00,0x08,0x80,0x04,0x80,0x02,0x00,0x79,0x00,0x7C,0x80,
        0x7E,0x40,0x7F,0x20,0x7F,0x90,0x07,0x88,0x01,0x84,0x00,0x82,0x00,0x00,0x00,0x00])
    # Exact 16x16 alpha-4 external icon payloads from DGN_01 resource bank.
    # The first four bytes of each .bin are the LVGL image header and are omitted here.
    status_bt_file = base64.b64decode("DUAAAgAAAADwAAAAAAAAD/8AAAAAAAD///AAAAAAD////wAAAAD///D/8AAAAA8P8A//AAAA//////AAAAAP////AAAAAAAP/wAAAAAAAP//8AAAAAD/////8AAAD///////AAAA8A/w//AAAAAAD///AAAAAAAP//AAAAAAAA//AAAA")
    status_4g_file = base64.b64decode("DUAAAgAAAAAAAAAAAAAAAAAAAAAABPAGzLIAAAAc4EsAewAAAJXgswAaAAAEoODQAAAAAAwg4OAHvQAAXbv6swAfAAAAAOBbAH4AAAAA4AjbbgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA")
    return {
        "gps": one_bit_icon(16, 16, gps),
        "soundOn": one_bit_icon(16, 16, sound_on),
        "soundOff": one_bit_icon(16, 16, sound_off),
        "statusBt": {"w": 16, "h": 16, "bpp": 4, "data": base64.b64encode(status_bt_file[4:]).decode("ascii")},
        "status4g": {"w": 16, "h": 16, "bpp": 4, "data": base64.b64encode(status_4g_file[4:]).decode("ascii")},
    }


def battery_masks() -> list[set[tuple[int, int]]]:
    width, height = 30, 14
    frame = {(x, y) for y in range(height) for x in range(28)
             if x in (0, 27) or y in (0, 13)}
    frame -= {(0, 0), (27, 0), (0, 13), (27, 13)}
    frame |= {(x, y) for x in (28, 29) for y in range(4, 10)}
    result = []
    for count in range(5):
        fill = {(x, y) for i in range(count) for x in range(2 + i * 6, 7 + i * 6)
                for y in range(2, 12)}
        result.append(frame | fill)
    bolt = ["00001100", "00011100", "00111000", "01110000", "11111111",
            "00011110", "00011100", "00111000", "00110000", "01100000"]
    result.append(frame | {(10 + x, 2 + y) for y, row in enumerate(bolt)
                           for x, pixel in enumerate(row) if pixel == "1"})
    return result


def battery_icons() -> list[dict]:
    icons = []
    for pixels in battery_masks():
        data = bytearray(4 * 14)
        for x, y in pixels:
            data[y * 4 + x // 8] |= 1 << (7 - x % 8)
        icons.append(one_bit_icon(30, 14, bytes(data)))
    return icons


def build(output: Path) -> None:
    config = json.loads(CONFIG.read_text(encoding="utf-8"))
    CACHE.mkdir(parents=True, exist_ok=True)
    noto = fetch(NOTO_URL, CACHE / "NotoSansSC-VF.ttf", NOTO_SHA256)
    montserrat = fetch(MONTSERRAT_URL, CACHE / "Montserrat-Medium.ttf", MONTSERRAT_SHA256)

    with tempfile.TemporaryDirectory() as temp_name:
        temp = Path(temp_name)
        variable = TTFont(noto)
        static = instantiateVariableFont(variable, {"wght": config["weight"]}, inplace=False)
        static["OS/2"].usWeightClass = config["weight"]
        static_path = temp / "NotoSansSC-Medium-500.ttf"
        static.save(static_path)
        verify = TTFont(static_path)
        if verify["OS/2"].usWeightClass != 500 or "fvar" in verify:
            raise SystemExit("failed to freeze Noto Sans SC at weight 500")

        paths = {
            "14": generate_font(static_path, 14, config["14"], "ui_font_dgn_14", temp, True),
            "16": generate_font(static_path, 16, config["16"], "ui_font_dgn_16", temp, True),
            "46": generate_font(montserrat, 46, "0123456789.-", "ui_font_dose_46", temp, False),
        }
        fonts = {key: parse_font(path) for key, path in paths.items()}

    resources = {
        "source": {
            "dgnCommit": DGN_COMMIT,
            "lvFontConv": LV_FONT_CONV_VERSION,
            "notoSha256": NOTO_SHA256,
            "montserratSha256": MONTSERRAT_SHA256,
            "weight": 500,
            "bpp": 4,
        },
        "fonts": fonts,
        "icons": {**builtin_icons(), "battery": battery_icons()},
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(resources, ensure_ascii=False, separators=(",", ":"))
    output.write_text("window.DGNProductionResources=" + payload + ";\n", encoding="utf-8")
    print(f"generated {output} ({output.stat().st_size} bytes)")
    print("glyphs:", ", ".join(f"{k}={len(v['glyphs'])}" for k, v in fonts.items()))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=OUT)
    args = parser.parse_args()
    build(args.output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

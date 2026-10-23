#!/usr/bin/env python3
"""Rebuild the pinned DGN_01 compiled fonts without cross-repo credentials.

The public font inputs and tool versions are pinned. After generation we replace
only lv_font_conv's informational header with the exact DGN_01 production header
and require the resulting Git blob SHA to equal the blob already committed in
DGN_01. Only byte-identical C files are handed to build-production-resources.py.
"""
from __future__ import annotations

import hashlib
import importlib.util
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
CACHE = ROOT / ".cache" / "fonts"
BASE_PATH = ROOT / "tools" / "build-production-resources.py"

NOTO_URL = "https://raw.githubusercontent.com/Auuueser/LC-Chinese-Project/e9ce4920627389fc772837acf2d220a034bc0e98/fonts/NotoSansSC-VF.ttf"
NOTO_SHA256 = "763146584CF0710223441356B4395E279021B0806C196614377A7A0174AE074A"
MONTSERRAT_URL = "https://raw.githubusercontent.com/lvgl/lvgl/v8.3.11/scripts/built_in_font/Montserrat-Medium.ttf"
MONTSERRAT_SHA256 = "421F26B23E2BE6B98373D32ACD3CB2897B154D4BF0A77D26534CE476E4CBED53"
LV_FONT_CONV_VERSION = "1.5.3"

spec = importlib.util.spec_from_file_location("dgn_resource_builder", BASE_PATH)
if spec is None or spec.loader is None:
    raise SystemExit("cannot import build-production-resources.py")
base = importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest().upper()


def download(url: str, path: Path, expected_sha: str) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists() and sha256(path) == expected_sha:
        return path
    with urllib.request.urlopen(url, timeout=120) as response:
        path.write_bytes(response.read())
    actual = sha256(path)
    if actual != expected_sha:
        path.unlink(missing_ok=True)
        raise RuntimeError(f"source SHA-256 mismatch: {actual} != {expected_sha}: {url}")
    return path


def converter() -> Path:
    for path in (ROOT / "node_modules/.bin/lv_font_conv", ROOT / "node_modules/.bin/lv_font_conv.cmd"):
        if path.exists():
            return path
    found = shutil.which("lv_font_conv")
    if found:
        return Path(found)
    raise RuntimeError(f"lv_font_conv {LV_FONT_CONV_VERSION} is not installed")


def production_header(size: int, name: str, symbols: str, noto: bool) -> str:
    if noto:
        source = f"{NOTO_SHA256}; weight: 500; bpp: 4; lossless RLE"
        font = r"<PROJECT>\3_PCTool\DGN01_Tool\font_build\NotoSansSC-Medium-500.ttf"
        selection = f"--range 0x20-0x7E --symbols {symbols}"
    else:
        source = f"{MONTSERRAT_SHA256}; Montserrat Medium; bpp: 4"
        font = r"<PROJECT>\1_Application\LVGL\scripts\built_in_font\Montserrat-Medium.ttf"
        selection = f"--symbols {symbols}"
    out = rf"<PROJECT>\1_Application\User\UI\Fonts\{name}.c"
    opts = f"--size {size} --bpp 4 --format lvgl --font {font} {selection} --no-kerning --lv-include lvgl.h --lv-font-name {name} -o {out}"
    return (
        "/*******************************************************************************\n"
        f" * Size: {size} px\n"
        " * Bpp: 4\n"
        f" * Source SHA-256: {source}\n"
        f" * Opts: {opts}\n"
        " ******************************************************************************/"
    )


def generate(font: Path, size: int, symbols: str, name: str, output: Path, ascii_range: bool) -> bytes:
    cmd = [str(converter()), "--size", str(size), "--bpp", "4", "--format", "lvgl", "--font", str(font)]
    if ascii_range:
        cmd += ["--range", "0x20-0x7E"]
    cmd += ["--symbols", symbols, "--no-kerning", "--lv-include", "lvgl.h", "--lv-font-name", name, "-o", str(output)]
    subprocess.run(cmd, check=True)
    text = output.read_text(encoding="utf-8")
    header = production_header(size, name, symbols, ascii_range)
    normalized, count = re.subn(r"\A/\*.*?\*/", lambda _match: header, text, count=1, flags=re.S)
    if count != 1:
        raise RuntimeError(f"cannot normalize lv_font_conv header: {name}")
    output.write_text(normalized, encoding="utf-8", newline="\n")
    return output.read_bytes()


def verify_converter_version() -> None:
    proc = subprocess.run([str(converter()), "--version"], check=True, text=True, capture_output=True)
    text = (proc.stdout + proc.stderr).strip()
    if LV_FONT_CONV_VERSION not in text:
        raise RuntimeError(f"unexpected lv_font_conv version: {text}")


def build_inputs() -> dict[str, bytes]:
    config = json.loads(CONFIG.read_text(encoding="utf-8"))
    noto_variable = download(NOTO_URL, CACHE / "NotoSansSC-VF.ttf", NOTO_SHA256)
    montserrat = download(MONTSERRAT_URL, CACHE / "Montserrat-Medium.ttf", MONTSERRAT_SHA256)
    verify_converter_version()

    result: dict[str, bytes] = {}
    with tempfile.TemporaryDirectory() as temp_name:
        temp = Path(temp_name)
        variable = TTFont(noto_variable)
        static = instantiateVariableFont(variable, {"wght": int(config["weight"])}, inplace=False)
        static["OS/2"].usWeightClass = int(config["weight"])
        noto_static = temp / "NotoSansSC-Medium-500.ttf"
        static.save(noto_static)

        jobs = {
            "14": (noto_static, 14, config["14"], "ui_font_dgn_14", True),
            "16": (noto_static, 16, config["16"], "ui_font_dgn_16", True),
            "46": (montserrat, 46, "0123456789.-", "ui_font_dose_46", False),
        }
        for key, (font, size, symbols, name, ascii_range) in jobs.items():
            raw = generate(font, size, symbols, name, temp / f"{name}.c", ascii_range)
            expected = base.FONT_SOURCES[key]["blob"]
            actual = base.git_blob_sha(raw)
            print(f"font {key}: rebuilt Git blob {actual}; expected {expected}")
            if actual != expected:
                raise RuntimeError(
                    f"{name}: reconstructed C is not byte-identical to DGN_01 production blob: {actual} != {expected}"
                )
            result[base.FONT_SOURCES[key]["path"]] = raw
    return result


# At the pinned DGN revision these are the exact compiled-in 16x16 A1 fallback
# masks from ui_assets.c. 4G/BT/battery have no compiled bitmap fallback there.
ASSET_STUB = r'''
static const uint8_t UI_GPS_BITMAP[] = {
0x00,0x00,0x07,0xC0,0x0F,0xE0,0x1F,0xF0,0x1C,0x70,0x18,0x30,0x18,0x30,0x1C,0x70,
0x1F,0xF0,0x0F,0xE0,0x0F,0xE0,0x07,0xC0,0x03,0x80,0x03,0x80,0x01,0x00,0x00,0x00};
static const uint8_t UI_SOUND_BITMAP[] = {
0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x80,0x01,0x90,0x07,0xA8,0x7F,0xA4,0x7F,0x94,
0x7F,0x94,0x7F,0x94,0x7F,0xA4,0x07,0xA8,0x01,0x90,0x00,0x80,0x00,0x00,0x00,0x00};
'''.encode("utf-8")


def main() -> None:
    sources = build_inputs()
    sources[base.ASSET_SOURCE] = ASSET_STUB

    def local_fetch(path: str) -> bytes:
        try:
            return sources[path]
        except KeyError as exc:
            raise RuntimeError(f"unpinned production source requested: {path}") from exc

    base.fetch = local_fetch
    base.main()
    print("Production resource build used byte-identical DGN_01 compiled font C inputs; no private-repo network access was required.")


if __name__ == "__main__":
    main()

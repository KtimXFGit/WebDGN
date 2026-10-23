#!/usr/bin/env python3
"""Rebuild pinned DGN_01 production inputs without private-repo credentials."""
from __future__ import annotations

import base64
import hashlib
import importlib.util
import json
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

# Exact LVGL .bin files from DGN_01@291d4fb. Their decoded bytes are checked
# against the pinned Git blob SHA before being exposed to the Web renderer.
PINNED_ICON_B64 = {
    "status4g": "DUAAAgAAAAAAAAAAAAAAAAAAAAAABPAGzLIAAAAc4EsAewAAAJXgswAaAAAEoODQAAAAAAwg4OAHvQAAXbv6swAfAAAAAOBbAH4AAAAA4AjbbgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    "statusBt": "DUAAAgAAAADwAAAAAAAAD/8AAAAAAAD///AAAAAAD////wAAAAD///D/8AAAAA8P8A//AAAA//////AAAAAP////AAAAAAAP/wAAAAAAAP//8AAAAAD/////8AAAD///////AAAA8A/w//AAAAAAD///AAAAAAAP//AAAAAAAA//AAAA",
    "statusGps": "DUAAAgAAAAAAAAAAAAAA///wAAAAAA////8AAAAA//AA//AAAA//D/8P/wAAD/D///D/AAAP8P//8P8AAA/w///w/wAAD/8P/w//AAAA//////AAAAAP////AAAAAAD///AAAAAAAPAPAAAAAAAADw8AAAAAAAAP8AAAAAAAAADwAAAA",
    "battery0": "C3jAAX///+CAAAAQgAAAEIAAABCAAAAcgAAAHIAAAByAAAAcgAAAHIAAAByAAAAQgAAAEIAAABB////g",
    "battery1": "C3jAAX///+CAAAAQvgAAEL4AABC+AAAcvgAAHL4AABy+AAAcvgAAHL4AABy+AAAQvgAAEIAAABB////g",
    "battery2": "C3jAAX///+CAAAAQvvgAEL74ABC++AAcvvgAHL74ABy++AAcvvgAHL74ABy++AAQvvgAEIAAABB////g",
    "battery3": "C3jAAX///+CAAAAQvvvgEL774BC+++AcvvvgHL774By+++AcvvvgHL774By+++AQvvvgEIAAABB////g",
    "battery4": "C3jAAX///+CAAAAQvvvvkL7775C++++cvvvvnL7775y++++cvvvvnL7775y++++QvvvvkIAAABB////g",
    "batteryExternal": "C3jAAX///+CAAAAQgAMAEIAHABCADgAcgBwAHIA/wByAB4AcgAcAHIAOAByADAAQgBgAEIAAABB////g",
}


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


def production_font_ref(noto: bool) -> str:
    return (r"<PROJECT>\3_PCTool\DGN01_Tool\font_build\NotoSansSC-Medium-500.ttf"
            if noto else r"<PROJECT>\1_Application\LVGL\scripts\built_in_font\Montserrat-Medium.ttf")


def production_output_ref(name: str) -> str:
    return rf"<PROJECT>\1_Application\User\UI\Fonts\{name}.c"


def generate(font: Path, size: int, symbols: str, name: str, output: Path, noto: bool) -> bytes:
    cmd = [str(converter()), "--size", str(size), "--bpp", "4", "--format", "lvgl", "--font", str(font)]
    if noto:
        cmd += ["--range", "0x20-0x7E"]
    cmd += ["--symbols", symbols, "--no-kerning", "--lv-include", "lvgl.h", "--lv-font-name", name, "-o", str(output)]
    subprocess.run(cmd, check=True)
    source = output.read_text(encoding="utf-8")
    source = source.replace("    .user_data = NULL,\n", "")
    source = source.replace(str(font), production_font_ref(noto))
    source = source.replace(str(output), production_output_ref(name))
    metadata = (f"Source SHA-256: {NOTO_SHA256}; weight: 500; bpp: 4; lossless RLE"
                if noto else f"Source SHA-256: {MONTSERRAT_SHA256}; Montserrat Medium; bpp: 4")
    source = source.replace(" * Opts:", f" * {metadata}\n * Opts:", 1)
    output.write_text(source.rstrip() + "\n", encoding="utf-8", newline="\n")
    return output.read_bytes()


def build_inputs() -> dict[str, bytes]:
    config = json.loads(CONFIG.read_text(encoding="utf-8"))
    noto_variable = download(NOTO_URL, CACHE / "NotoSansSC-VF.ttf", NOTO_SHA256)
    montserrat = download(MONTSERRAT_URL, CACHE / "Montserrat-Medium.ttf", MONTSERRAT_SHA256)
    version = subprocess.run([str(converter()), "--version"], check=True, text=True, capture_output=True)
    if LV_FONT_CONV_VERSION not in (version.stdout + version.stderr):
        raise RuntimeError("unexpected lv_font_conv version")

    result: dict[str, bytes] = {}
    with tempfile.TemporaryDirectory() as temp_name:
        temp = Path(temp_name)
        variable = TTFont(noto_variable)
        static = instantiateVariableFont(variable, {"wght": int(config["weight"])}, inplace=False)
        static["OS/2"].usWeightClass = int(config["weight"])
        noto_static = temp / "NotoSansSC-Medium-500.ttf"
        static.save(noto_static)
        check = TTFont(noto_static)
        if check["OS/2"].usWeightClass != 500 or "fvar" in check:
            raise RuntimeError("failed to freeze Noto Sans SC at weight 500")
        jobs = {
            "14": (noto_static, 14, config["14"], "ui_font_dgn_14", True),
            "16": (noto_static, 16, config["16"], "ui_font_dgn_16", True),
            "46": (montserrat, 46, "0123456789.-", "ui_font_dose_46", False),
        }
        for key, (font, size, symbols, name, noto) in jobs.items():
            raw = generate(font, size, symbols, name, temp / f"{name}.c", noto)
            expected = base.FONT_SOURCES[key]["blob"]
            actual = base.git_blob_sha(raw)
            print(f"font {key}: rebuilt Git blob {actual}; expected {expected}")
            if actual != expected:
                raise RuntimeError(f"{name}: reconstructed C is not byte-identical to DGN_01 production blob")
            result[base.FONT_SOURCES[key]["path"]] = raw
    return result


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
    for name, encoded in PINNED_ICON_B64.items():
        meta = base.EXTERNAL_ICON_SOURCES[name]
        raw = base64.b64decode(encoded)
        base.require_blob(raw, meta["blob"], meta["path"])
        sources[meta["path"]] = raw
        print(f"icon {name}: Git blob {meta['blob']} verified")

    def local_fetch(path: str) -> bytes:
        if path not in sources:
            raise RuntimeError(f"unpinned production source requested: {path}")
        return sources[path]

    base.fetch = local_fetch
    base.main()
    print("Production resources verified against DGN_01 compiled fonts and exact status/battery icon blobs.")


if __name__ == "__main__":
    main()

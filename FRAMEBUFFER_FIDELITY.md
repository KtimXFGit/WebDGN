# WebDGN 真机 framebuffer 一致性说明

`Production` 模式以 DGN_01 `main@291d4fb201a647f128c02f9e916b057a266e600a` 为固定基线，显示链不再依赖浏览器字体栅格化：

1. CI 直接下载该提交里已经参与固件构建的 `ui_font_dgn_14.c`、`ui_font_dgn_16.c`、`ui_font_dose_46.c`，并校验 Git blob SHA；
2. 逐字形复制 `glyph_bitmap` 的原始 payload，保留 `bitmap_format`，不再用 TTF/WOFF + `lv_font_conv` 重建；
3. 浏览器执行与 LVGL 8.3 `lv_font_fmt_txt.c` 同构的 RLE 状态机和行 XOR prefilter；
4. 4bpp coverage 使用 LVGL 的 `0,17,34,...,255` opacity；
5. 工作 framebuffer 是 `Uint16Array(240*320)`，每个元素对应真机 `LV_COLOR_DEPTH=16`、`LV_COLOR_16_SWAP=1` 下的 `lv_color_t.full`；
6. 混色使用 LVGL 16-bit 整数 `lv_color_mix` 路径；只有显示给浏览器时才把 RGB565 转成 RGBA8888 并调用 `putImageData()`。

渲染器会返回 `framebufferFormat: LVGL_RGB565_SWAP16` 和基于原始 16-bit framebuffer 的 `framebufferHash`，便于后续与真机抓帧做自动回归比较。

### 精确边界

字体 payload、RLE 解码、4bpp opacity、RGB565 存储/混色链已经直接对齐固件。当前页面对象/几何仍由 WebDGN 的 JS renderer 按 DGN_01 UI 源码复现，并不是把完整 LVGL C renderer 编译成 WebAssembly；因此“全屏逐像素 bit-exact”最终仍应以同一状态下的真机 framebuffer 抓帧比较为验收标准。另一个已知边界是外部 Flash 资源银行中的状态栏 RGB565A8 `.bin` 未提交到 DGN_01 Git 仓库。Web 端不再合成近似图标，而是严格走 `ui_assets.c` 的资源缺失回退：GPS/声音使用源码内置 16×16 A1 mask，4G/蓝牙/电池使用源码定义的文字回退。

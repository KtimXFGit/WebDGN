# WebDGN 真机 framebuffer 一致性说明

`Production` 模式以 DGN_01 `main@291d4fb201a647f128c02f9e916b057a266e600a` 为固定基线，显示链不依赖浏览器字体栅格化。

## 字体来源校验

WebDGN Pages 无需、也不会持有访问私有 DGN_01 仓库的 PAT。CI 从 SHA-256 固定的生产字体输入重建 LVGL C 字体，并把生成文件头规范化成 DGN_01 Production 原文件头；随后计算完整文件的 Git blob SHA。三个字体只有在 blob SHA 与 DGN_01 固定提交完全相等时才进入资源提取：

- `ui_font_dgn_14.c` → `3b52e56f6d120f83c078566b3074d9d3293f46b9`
- `ui_font_dgn_16.c` → `0b952f3eb74de851c9da75911cf4dc7aa75a55b3`
- `ui_font_dose_46.c` → `ac5a5bd836927007530611ea294d54ff67a086c9`

因此这里不是“看起来相同”的重新栅格化：构建产物必须与 DGN_01 中已经参与固件构建的 C 文件字节级相同，否则部署失败。

## Web Production 像素链

1. 从通过 blob 校验的 C 文件逐字形复制 `glyph_bitmap` 原始 payload，保留 `bitmap_format`；
2. 浏览器执行与 LVGL 8.3 `lv_font_fmt_txt.c` 同构的 RLE 状态机和行 XOR prefilter；
3. 4 bpp coverage 使用 LVGL 的 `0,17,34,...,255` opacity；
4. 工作 framebuffer 是 `Uint16Array(240*320)`，元素对应 `LV_COLOR_DEPTH=16`、`LV_COLOR_16_SWAP=1` 下的 `lv_color_t.full`；
5. 混色使用 LVGL 16-bit 整数路径；
6. 只有浏览器显示阶段才做 RGB565 → RGBA8888 并调用 `putImageData()`。

渲染器返回 `framebufferFormat: LVGL_RGB565_SWAP16` 和基于 16-bit framebuffer 的 hash，可用于回归比较。

## Golden / 真机 diff

最终验收工具：

```bash
npm run diff:framebuffer -- device-frame.bin web-frame.bin
```

输入固定为 `240×320×2 = 153600` 字节，解释为小端 `uint16` word；word 的数值是交换字节后的 LVGL RGB565 值。这与 CH32V307 小端内存中 `LV_COLOR_16_SWAP=1` 的 framebuffer word 约定一致。若抓取的是 LCD SPI/8080 总线字节流而不是 MCU framebuffer 内存，需要先转换成这一格式。

输出包括：

- 两份 framebuffer 的 SHA-256；
- differingPixels / differingPercent；
- 差异最小 bounding box；
- RGB565 R5/G6/B5 的平均绝对差和最大绝对差。

完全一致退出码为 `0`，有差异为 `1`，尺寸/参数错误为 `2`。这使自动化测试可以把“像素级一致”作为明确门槛，而不是靠截图目测。

## 精确边界

已经直接对齐并可自动验证的是字体 C 输入、原始 glyph payload、RLE/XOR 解码、4 bpp opacity、RGB565 存储及整数混色链。

尚不能仅凭 WebDGN 自身宣称“全屏 bit-exact”的部分，是页面对象/圆角矩形/边框/抗锯齿等几何仍由 JS renderer 按 DGN_01 UI 源码复现，并不是完整 LVGL C draw engine。只有在同一 UI 状态下取得真机 framebuffer dump，并由上述 diff 得到 `differingPixels = 0`，才应称该状态整屏逐像素一致。

外部 Flash 资源银行中的状态栏 RGB565A8 `.bin` 也不是全部随 DGN_01 Git 源码提供。当前 Web 端不伪造近似图标，而严格采用 `ui_assets.c` 的资源缺失回退：GPS/声音使用源码内置 16×16 A1 mask，4G/蓝牙/电池使用固件定义的文字回退。

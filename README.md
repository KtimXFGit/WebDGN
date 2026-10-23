# WebDGN

DGN_01 多功能主机的在线 UI / 功能模拟器。

当前 Web 仿真基线固定到 DGN_01 `main`：`291d4fb201a647f128c02f9e916b057a266e600a`（2026-10-23）。

## Production 同源渲染

WebDGN 的 Production 路径不使用浏览器字体栅格化。由于 DGN_01 是私有仓库，WebDGN Pages 的 `GITHUB_TOKEN` 不能跨仓库读取其文件，因此 CI 采用“可证明等价”的构建链：

1. 下载 SHA-256 固定的生产字体输入；
2. 使用固定版本 `lv_font_conv 1.5.3` 和 `fonttools 4.60.1`，按 DGN_01 的字符集、字号、weight、`--no-kerning` 等参数重建三个 LVGL C 字体；
3. 将生成文件的信息头规范化为 DGN_01 Production 原文件头；
4. 计算完整 C 文件的 Git blob SHA，并要求分别严格等于 DGN_01 固定提交中的三个 blob；
5. 只有字节级一致时才提取原始 `glyph_bitmap` payload 和 `bitmap_format`；否则 CI 立即失败。

锁定值：

- DGN_01 commit：`291d4fb201a647f128c02f9e916b057a266e600a`
- `ui_font_dgn_14.c`：`3b52e56f6d120f83c078566b3074d9d3293f46b9`
- `ui_font_dgn_16.c`：`0b952f3eb74de851c9da75911cf4dc7aa75a55b3`
- `ui_font_dose_46.c`：`ac5a5bd836927007530611ea294d54ff67a086c9`
- Noto Sans SC 输入 SHA-256：`763146584CF0710223441356B4395E279021B0806C196614377A7A0174AE074A`
- Montserrat Medium 输入 SHA-256：`421F26B23E2BE6B98373D32ACD3CB2897B154D4BF0A77D26534CE476E4CBED53`

浏览器随后执行 LVGL 8.3 的 4 bpp RLE / 行 XOR prefilter 解码，按 `0,17,34,...,255` opacity 做 16-bit 混色。工作 framebuffer 是 `Uint16Array(240*320)`，对应 DGN_01 的 `LV_COLOR_DEPTH=16`、`LV_COLOR_16_SWAP=1`；只有最终显示到 Canvas 时才转换为 RGBA8888，界面文本不调用 `fillText()`。

> “同源”不等于已经证明整屏 bit-exact。字体 payload / 解码 / 颜色存储与混色链有字节级来源校验；页面圆角、边框等几何图元目前仍由 JS renderer 复现，而不是完整 LVGL C renderer。整屏最终以真机 framebuffer diff 为验收标准。

## 页面结构

```text
240 x 320
├─ status   0..23      24 px
├─ content 24..287    264 px
└─ nav     288..319    32 px
```

当前主界面按 `ui_home_screen.c`：

- 主机卡：`x=6 y=4 w=111 h=74`
- 探头卡：`x=123 y=4 w=111 h=74`
- 主测量卡：`x=6 y=84 w=228 h=101`
- 累计剂量卡：`x=6 y=191 w=111 h=67`
- 计数率卡：`x=123 y=191 w=111 h=67`

底部页面顺序与固件 `ui_page_t` 一致：设置 / 测量 / 趋势。趋势页按当前固件 `LV_CHART_TYPE_BAR` 复刻，并使用运行时最终图表区域 `x=30 y=36 w=198 h=138`。

## Web → 真机迁移

视觉参数仍由 `dgn-ui-spec.js` 单源维护：

1. 在线调整稳定布局参数时优先修改 `dgn-ui-spec.js`。
2. Web Production 渲染器消费同一份 spec，不维护第二套坐标。
3. 执行 `npm run export:lvgl` 生成 `generated/dgn_ui_layout_generated.h`。
4. 将生成参数应用到 DGN_01 对应 LVGL 构建函数；动态行为继续以 DGN_01 状态机为准。
5. 每次同步 DGN_01 后更新 source commit / blob 锁定值，并由 CI 重建与校验 Production 资源。

当前这仍是“受控迁移链”，DGN_01 尚未直接 `#include` WebDGN 生成头，因此不宣称一键自动同步。

## 构建与验证

```bash
npm install
python -m pip install "fonttools==4.60.1"
npm test
npm run build:resources
node tests/production-resource.test.mjs
npm run export:lvgl
```

### 真机 framebuffer 对比

`tools/diff-framebuffer.mjs` 用于最终逐像素验收。输入文件必须都是 `240×320×2 = 153600` 字节，格式为小端 `uint16` 数组，每个 word 是 `LV_COLOR_16_SWAP=1` 下的 `lv_color_t.full`：

```bash
npm run diff:framebuffer -- device-frame.bin web-frame.bin
```

工具输出双方 SHA-256、差异像素数/比例、差异包围盒，以及 RGB565 的 R5/G6/B5 最大与平均通道偏差。完全一致返回退出码 `0`；存在像素差异返回 `1`；输入格式错误返回 `2`。

详细边界见 `FRAMEBUFFER_FIDELITY.md`。

在线地址：

`https://ktimxfgit.github.io/WebDGN/`

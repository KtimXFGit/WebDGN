# WebDGN

DGN_01 多功能主机的在线 UI / 功能模拟器。

当前 Web 仿真基线固定到 DGN_01 `main`：`291d4fb201a647f128c02f9e916b057a266e600a`（2026-10-23）。

## Production 同源渲染

WebDGN 不再使用浏览器字体近似真机。GitHub Pages 构建会从 DGN_01 Production 固定输入重新生成并解析 UI 资源：

- `lv_font_conv 1.5.3`
- Noto Sans SC Variable Font，固定 `wght=500`，源文件 SHA-256：`763146584CF0710223441356B4395E279021B0806C196614377A7A0174AE074A`
- Montserrat Medium 主剂量率字体，源文件 SHA-256：`421F26B23E2BE6B98373D32ACD3CB2897B154D4BF0A77D26534CE476E4CBED53`
- DGN_01 的 14 px / 16 px / 46 px 字符集与 `--no-kerning` 参数
- LVGL 4 bpp lossless RLE + 行 XOR prefilter 解码规则
- DGN_01 状态图标、电池图标的 alpha bitmap
- 240×320 ST7789V RGB565 色彩量化

`dgn-production-ui.js` 在 240×320 framebuffer 中直接绘制字形 alpha bitmap 和图元，界面文本不调用 Canvas `fillText()`。因此相同 UI model / 状态输入下，Web 侧字形、advance、offset、图标像素和逻辑坐标来自与 DGN_01 Production 相同的构建输入。

> “同源”不等于浏览器实时镜像真机 framebuffer。WebDGN 仍是状态机模拟器；没有通过设备协议公开的运行状态仍由模拟数据驱动。

## 页面结构

```text
240 x 320
├─ status  0..23      24 px
├─ content 24..287   264 px
└─ nav     288..319   32 px
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
5. 每次同步 DGN_01 后更新 `source.commit`，并由 CI 重新生成 Production 字形/图标资源。

## 构建与验证

```bash
npm install
python -m pip install "fonttools==4.60.1"
npm test
npm run build:resources
npm run export:lvgl
```

Pages workflow 会执行同样的资源生成和校验后再发布；源字体 SHA、DGN 基线或资源生成链不一致时直接失败，不静默回退到系统字体。

在线地址：

`https://ktimxfgit.github.io/WebDGN/`

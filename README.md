# WebDGN

DGN_01 多功能主机的在线 UI / 功能模拟器。

当前 Web 仿真基线固定到 DGN_01 `main`：`291d4fb201a647f128c02f9e916b057a266e600a`（2026-10-23）。

## 目标

- 按 DGN_01 Production UI 的 240×320 ST7789V 逻辑坐标复刻状态栏、主界面、趋势页、设置页与常用交互。
- Web 侧所有布局/颜色/页面元数据集中在 `dgn-ui-spec.js`，避免把坐标散落在 DOM/CSS 中。
- `tools/export-lvgl-layout.mjs` 将 Web 侧共享参数导出为 C 头文件，便于后续把在线 UI 调整迁移回真实主机。
- 保留 DGN_01 源码基线 SHA，后续同步时能够明确判断 Web 仿真基于哪个固件版本。
- 使用纯静态 HTML/CSS/JavaScript，无 npm/CDN 运行时依赖，可直接部署到 GitHub Pages。

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

底部页面顺序与固件 `ui_page_t` 一致：设置 / 测量 / 趋势。

## 迁移约定

1. 优先修改 `dgn-ui-spec.js` 中的 token、布局和页面参数。
2. Web 渲染器只消费 spec，不自行定义第二套“魔法数字”。
3. 执行 `node tools/export-lvgl-layout.mjs` 可生成 `generated/dgn_ui_layout_generated.h`。
4. 迁移到 DGN_01 时，先对照 `ui_config.h`、`ui_theme.c`、`ui_home_screen.c`、`ui_app.c`，再把生成参数应用到 LVGL 代码；涉及动态行为时仍以固件状态机为准。
5. 每次从 DGN_01 同步后更新 `source.commit`，避免 Web 与真机 UI 无基线漂移。

## 在线发布

仓库包含 GitHub Pages workflow；启用 Pages 的 GitHub Actions 发布源后，站点地址为：

`https://ktimxfgit.github.io/WebDGN/`

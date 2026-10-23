# DGN_01 UI 源码分析（基线 291d4fb）

## 运行链

`ui_runtime.c` 在调度前完成 LCD/LVGL/主题初始化并显示 bootstrap；资源状态可用或 1500 ms 超时后创建 `ui_dashboard`，随后初始化 `ui_home_screen`。UI 任务 10 ms 周期运行；模型约 250 ms 刷新，趋势 1 s 采样。

## UI 分层

- `ui_config.h`：240×320、状态栏 24、导航 32、内容区 264、趋势 60 点、资源开关。
- `ui_theme.c`：白蓝仪器风调色板。
- `ui_app.c`：LVGL shell、状态栏、底部导航、趋势和设置页面，以及设置详情页。
- `ui_home_screen.c`：当前测量主界面；运行时在测量页置于 `ui_app` 内容之上。
- `ui_dashboard.c`：把 measurement/system/storage/communication/GNSS/RS485 快照转换为 UI model；处理设置保存、趋势采样、按键和页面状态。
- `ui_runtime.c`：LCD/LVGL 生命周期、更新模式、电量弹窗、关机长按、趋势图二次样式修正。
- `ui_assets.c` / `ui_resource_runtime.c`：内置/外部 Flash 图标和资源 bank。
- `ui_settings_input.c`：设置页按键状态机。
- `ui_battery_alert.c`：低电量提示与自动关机逻辑。

## 页面

### 测量主界面

内容坐标以 `y=24` 为原点：主机/探头双状态卡、剂量率主卡、累计剂量卡、计数率卡。外接 RS485 探头在线时，数据源和探头名称/状态动态切换。

### 趋势

60 点；模型每秒追加一点。`ui_app.c` 当前创建 `LV_CHART_TYPE_BAR`，`ui_runtime.c` 再把图表最终调整到 `x=30 y=36 w=198 h=138` 并补充坐标轴、刻度和网格。WebDGN 因此按柱状趋势复刻，而不是折线近似。

### 设置

16 个顶层条目、每屏 6 行；滚动条和选中边框。包含声音、按键音、背光、GM 音、语言、RTC、日志、设备、外接探头、4G、蓝牙、GNSS、数据、累计清零、管理员及返回主界面。管理员下含高压、测量参数、日志管理等子页。

## Production 同源资源链

DGN_01 当前链接三套 UI 字体：`ui_font_dgn_14.c`、`ui_font_dgn_16.c`、`ui_font_dose_46.c`。WebDGN Pages 构建通过 `tools/build-production-resources.py` 用相同输入和 `lv_font_conv 1.5.3` 重新生成字体，再按 DGN_01 自带 `lv_font_fmt_txt.c` 的 4 bpp lossless RLE / 行 XOR prefilter 规则解码为 Web glyph bitmap。

Web 渲染时：

- 字符 advance、box、offset 使用 LVGL glyph descriptor；
- 字体像素为 4-bit alpha，不调用浏览器 `fillText()`；
- GPS/声音/蓝牙/4G/电池使用 DGN 资源定义的 alpha bitmap；
- 颜色先量化到 ST7789V 对应 RGB565；
- 卡片、边框、状态点、趋势图等由 240×320 framebuffer 图元绘制。

因此 WebDGN 的字体和图标不再属于“视觉近似”，而是与当前 Production 基线共享同一资源生成输入和解码规则。

## Web 与真机迁移策略

稳定视觉常量放入 `dgn-ui-spec.js`：屏幕几何、调色板、主页面矩形、趋势图矩形、设置列表几何。Web Production 渲染器消费同一份 spec，`tools/export-lvgl-layout.mjs` 将这些参数导出为 C 宏。后续在线调整布局时，先改 spec，再把生成参数应用到 DGN_01 对应 LVGL 构建函数；动态行为仍以固件状态机为准。

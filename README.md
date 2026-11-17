# 小鱼阅读器 · v0.2.0 实验版

SillyTavern 原生扩展。保留 v0.1 的阅读入口、独立双页阅读层、左右点击/滑动翻页、中央呼出工具栏和退出功能。

## 本轮变化
- 从酒馆已渲染的 `.mes_text` 中提取可见文本，跳过 `display:none`、`visibility:hidden`、`opacity:0`、`hidden`、`aria-hidden=true`、`inert`、`content-visibility:hidden` 元素和表单/按钮等。
- 对关闭的 `<details>` 只保留 `<summary>`（目前尚不能判断 summary 是否为正文）。
- 进入阅读模式时采样正文计算样式，尝试继承字体、颜色、字号、字距、行高。字号按钮仍可临时微调。
- 保留 v0.1 字符级分页；不修改原始聊天内容。

## 尚未实现
- 富文本 HTML 的跨页拆分、单独的正则重新执行、内联高亮/颜色、完整 CSS 样式复刻。
- 被 CSS `clip-path`、视觉遮罩、折叠插件 JavaScript 或特殊伪元素隐藏的内容，可能仍被读到。
- `<details>` 的 summary 可能仍是思维链标题；如遇到请提供截图和 DOM 示例。

## 更新方法
在 GitHub 仓库根目录替换 `manifest.json`、`index.js`、`style.css`，提交后在 SillyTavern 扩展管理器更新扩展并刷新。先备份原版。不要上传外层文件夹造成嵌套。

## 测试建议
同一条 AI 回复，分别检查：思维链是否被过滤；正文是否完整；字体、颜色、字号是否接近酒馆；分页、翻页、退出是否正常。若正文缺失，回滚 v0.1。


v0.3.23 visual test: temporary flip surfaces no longer paint a second translucent paper tint over the shared book backdrop. Diagnostic panel remains available; opaque isolation mode still overrides the test.

v0.3.24 visual test: remove only the stationary duplicate paper tint; rotating sheet retains its translucent background. Diagnostic controls retained.

v0.3.25 timing test: 500ms linear page turn; midpoint 250ms; fallback completion 540ms. All v0.3.24 visual and diagnostic behavior retained.


v0.3.30: Penguin recovery from original SillyTavern chat markers when regex-rendered DOM no longer carries dm-* classes; keep v0.3.29 toggle and v0.3.28 flip behavior.

v0.3.32: Remove empty paragraph/inline wrappers left by hidden penguin components before pagination, so they do not reserve blank height.

v0.3.34: Balance penguin paragraph incoming/outgoing spacing at 10px; retain bubble and all flip behavior.

v0.3.35: Add zero-width pagination boundaries around penguin components to keep avatars with bubbles; reduce incoming gap and retain outgoing breathing room.

## v0.3.38 流式阅读 1.0（实验）
- 手动打开已有正文的 AI 消息；不自动弹出、不自动翻页。
- 阅读器打开期间每 350ms 检查源消息正文是否变化；仅变化时重建安全富文本快照和分页。
- 对仅追加的消息尽量复用已完成的前置分页边界，末尾两页始终重新排版；若正文被改写、重生成、字号/设置/窗口尺寸变化则解除冻结。
- 翻页动画播放期间暂停同步，动画结束后再更新；退出阅读器停止轮询。
- 当前版本为兼容性验证版：不同酒馆主题/正则的 DOM 更新可能影响稳定分页，需在真实流式回复下测试。尚未实现后台独立分页或可视化双页预热提示。

# 设计文档：dsh-catppuccin-theme 自定义首屏 loading 页

日期：2026-08-14
状态：已获用户批准（设计评审通过）

---

## 1. 目标

为 `dsh-catppuccin-theme` 插件新增自定义 DSH WebUI 首屏 loading 页：

- 版式：Catppuccin 彩虹猫 LOGO（固定 150px，来自 `logo.svg` 原文件）在上，
  四个 flavor 呼吸点（10px、间距 10px、错峰呼吸）在下，整体居中；
- 底色跟随已保存的 flavor（默认 Mocha），不透明全屏覆盖；
- 从浏览器**第一帧**开始生效，无白屏闪现（替换默认白底 HARNESS + spinner）；
- 启动完成后自动淡出，失败时让内核失败报告可见，任何情况下不困住用户。

## 2. 现状与机制（已验证的事实）

1. DSH 首屏 loading 由客户端内核 `dsh-client-web` 的 `AppRoot` 渲染
   （`#root` 内的 boot 卡片：HARNESS 字样 + spinner + "Loading plugins…"，
   CSS 类名为构建哈希，底色 `--dsw-alias-bg-base` 在插件加载前不可用）。
2. 官方 `dsh-client-ui-theme` 宿主端通过 `webServer.tapIndex(html => html)`
   在每次 index.html 响应中注入 `<body>` 暗色 bootstrap 脚本 —— 这是
   DSH 为「插件级首屏定制」预留的官方通道（dsh-host-webserver 的
   `indexTaps`，按注册顺序对每次 index 响应生效）。
3. index.html 每次响应都会重新 `readFile` dist 并重放 taps；插件 bundle
   经 `/plugins/<id>/client.js` 每次请求实时读盘（cache-control: no-cache）。
4. 本插件的宿主半（`lib/index.js`）已注入 `settings` 服务并持有
   `dsh-catppuccin-theme` 设置命名空间（`flavor`/`accent`/字体字段），
   可直接读取已保存 flavor。
5. 内核 boot 卡片的失败态会渲染 "Failed to load plugins" 文案（fail-loud）。
6. 本插件以 junction 方式链接进 profile（`.dsh\profiles\web\node_modules` →
   `.dsh\plugins\dsh-catppuccin-theme`），单一真实副本。

## 3. 方案选择

| 方案 | 结论 |
|---|---|
| ① 宿主端 `tapIndex` 注入完整 splash（**采用**） | 第一帧即 Catppuccin、与插件 bundle 解耦、官方通道；代价：宿主代码变更需重启 `dsh web` |
| ② 纯客户端 bundle 注入 | 刷新即生效，但首帧先闪默认白底 loading（bundle 加载在内核渲染之后），体验打折，否决 |
| ③ 仅注入调色板 CSS 变量 | 无法放 LOGO/呼吸点，不符合确认的版式，否决 |

## 4. 组件设计

### 4.1 宿主端 `lib/index.js`（唯一改动文件）

新增三个部分：

**a) 调色板常量（仅宿主侧所需子集）**

```js
const SPLASH_PALETTE = {
  latte:      { base: '#f6f7f9', mantle: '#eef0f4', text: '#4c4f69', red: '#d20f39' },
  frappe:     { base: '#303446', mantle: '#292c3c', text: '#c6d0f5', red: '#e78284' },
  macchiato:  { base: '#24273a', mantle: '#1e2030', text: '#cad3f5', red: '#ed8796' },
  mocha:      { base: '#1e1e2e', mantle: '#181825', text: '#cdd6f4', red: '#f38ba8' }
}
// 呼吸点用四个 flavor 的身份色（固定，不随 flavor 切换）：
// #dd7878 / #8caaee / #8aadf4 / #cba6f7
```

**b) SVG 内联与作用域改写**

- 每次 index 响应时 `readFileSync(logo.svg)`（失败则跳过注入，安全降级）；
- 将 SVG 内 `<style>` 的 `:root` 选择器改写为 `#cppc-splash`，
  `#red`/`#peach`/`#yellow`/`#green`/`#sapphire`/`#mauve` 改写为
  `#cppc-splash #xxx`，`.is-animated` 改写为 `#cppc-splash .is-animated`；
- 移除 `height="40"` 属性（尺寸由外层 CSS 控制为 150px × 150px）；
- 整个 SVG 包进 `<div id="cppc-splash">`，作用域内定义
  `--mantle`/`--text`/`--red` 为当前 flavor 值（logo 的 body/face/bowtie
  路径引用这三个变量）。

**c) `tapIndex` 变换与注入**

```js
ctx.inject(['webServer'], (httpCtx) => {
  httpCtx.effect(() => httpCtx.webServer.tapIndex((html) =>
    injectSplash(html, readPerso(ctx))), 'catppuccin-theme: boot splash')
})
```

`injectSplash(html, flavor)` 在 `<body>` 开标签后注入三块内容：

1. `<style>`：`#cppc-splash` 全屏 fixed overlay（`inset:0`、z-index 上限、
   底色 = flavor base、居中列、gap 22px）；logo 固定 `150px × 150px`；
   呼吸点容器（4 个 10px 圆点、gap 10px、`spv-breath` 1.6s 错峰）；
   淡出态 `.dismissing{opacity:0}` + `transition: opacity 250ms`；
   `@media (prefers-reduced-motion: reduce)` 停用全部动画。
2. `<div id="cppc-splash">`：内联改造后的 logo.svg + 四个呼吸点。
3. `<script>` 自愈逻辑（IIFE）：
   - `MutationObserver` 监听 `#root`（childList + subtree）：
     a. 内核 boot 卡片被移除（启动完成）→ 淡出 250ms 后移除 DOM；
     b. 出现 "Failed to load plugins" 文本 → 立即移除（让失败报告可见）；
   - 12s 硬超时兜底强制移除；
   - 暴露 `window.__cppc_splash_dismiss()` 供调试/未来客户端调用。

### 4.2 客户端 `lib/client.js`

**不改动。** splash 生命周期完全自持（宿主注入的内联脚本），
与插件 bundle 解耦：即使 catppuccin 插件客户端加载失败，splash
也能正常消失。

## 5. 数据流

```
settings doc (flavor) ──► tapIndex 每次 index 响应时读取
                              │
                              ▼
                    注入 <style> + #cppc-splash(logo+呼吸点) + 自愈脚本
                              │
                              ▼
浏览器解析 HTML ──► 第一帧即 splash（无白屏）──► 内核启动
                              │
             boot settle（boot 卡片卸载）或失败文案出现或 12s 超时
                              │
                              ▼
                    淡出 250ms ──► 移除 DOM ──► 真实界面/失败报告
```

## 6. 错误处理

| 场景 | 行为 |
|---|---|
| `logo.svg` 缺失或读取失败 | 跳过注入，回退默认 loading（不报错、不阻塞启动） |
| 内核启动失败（fail-loud） | 自愈脚本检测失败文案，立即移除 splash，失败报告可见 |
| 观察逻辑失效（任何原因） | 12s 硬超时强制移除 |
| 设置文档无 flavor | 默认 Mocha |
| `prefers-reduced-motion` | logo 六色 fill 循环与呼吸动画停用，静态显示 |

## 7. 测试与验收

手动验证矩阵（宿主变更需先重启 `dsh web`）：

1. 四个 flavor 分别保存 → 刷新 → 首帧底色/猫脸/领结颜色正确；
2. 正常启动：splash 在启动完成后 250ms 内淡出进入界面；
3. 构造插件失败（临时改坏一个插件的 bundle）→ 失败报告可见；
4. `logo.svg` 临时改名 → 刷新 → 回退默认 loading，无报错；
5. Windows「动画效果」关闭（reduced-motion）→ 动画停用、静态可见；
6. 修改 `logo.svg` 文件 → 仅刷新页面即看到新 logo（无需重启）。

## 8. 边界与范围外

- 不做设置页开关/样式选项（用户确认「就这样」，YAGNI）；
- 不做自定义文字/进度条；
- 不支持在 splash 期间展示真实加载进度（内核无此契约，观察 boot
  卡片文案不可靠）；
- 只覆盖 web 形状（插件 `dsh.client.platform: "web"` 声明不变）。

## 9. 生效方式与交付说明

- 宿主代码（`lib/index.js`）变更需重启 `dsh web` 后生效（当前会话的
  服务器不能代为重启，交付时给出重启命令）；
- 之后仅改 `logo.svg` 或切换 flavor：刷新页面即可生效。

# 首屏 Loading 页实现计划（dsh-catppuccin-theme）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 dsh-catppuccin-theme 新增自定义 DSH 首屏 loading 页：内联 logo.svg（彩虹轮转）+ 四个 flavor 呼吸点，底色跟随已保存 flavor，浏览器第一帧即生效，启动完成自动淡出。

**Architecture:** 宿主端 `lib/index.js` 通过官方 `webServer.tapIndex()` 钩子在每次 index.html 响应中注入自持 splash（`<style>` + 标记 + 自愈 `<script>`），纯函数逻辑抽到新模块 `lib/splash.js` 以便 node:test 单测；客户端 bundle 完全不动。

**Tech Stack:** Node.js ≥ 20（本机 v24.15.0）、ESM、node:test、Cordis 插件契约（`ctx.inject` / `ctx.effect` / `webServer.tapIndex`）。

**Spec:** `docs/superpowers/specs/2026-08-14-loading-page-design.md`（已批准）

**工作目录:** `C:\Users\shenkang\.dsh\plugins\dsh-catppuccin-theme`（下文所有相对路径以此为根）

**重要约束:** 本计划的宿主代码变更需要**重启 `dsh web`** 才生效；当前正在运行的这个会话就挂在该服务器上，因此**执行者绝不能自己重启它**——由用户在最后一步手动重启验收。

---

## 文件结构

- `test/splash.test.js`（新建）—— `lib/splash.js` 的单元测试（node:test）
- `lib/splash.js`（新建）—— 纯函数：调色板、flavor 校验、SVG 作用域改写、样式/标记/脚本构建、HTML 注入
- `lib/index.js`（修改）—— 接线：`webServer.tapIndex` 注入 + logo.svg 读取
- `package.json`（修改）—— `files` 加 `logo.svg`、`version` 升 0.3.0、加 `test` 脚本

---

### Task 0: 前置检查

**Files:** 无

- [ ] **Step 1: 确认环境**

Run（在 PowerShell 中）:

```powershell
node --version
Get-ChildItem 'C:\Users\shenkang\.dsh\plugins\dsh-catppuccin-theme' -Force | Select-Object -ExpandProperty Name
```

Expected: `node --version` 输出 `v24.15.0`（≥ v20 即可）；目录列表含 `lib`、`logo.svg`、`package.json`，**不含** `.git`。

- [ ] **Step 2: 确认运行中的服务不能被碰**

Run:

```powershell
(Invoke-WebRequest -Uri 'http://127.0.0.1:3080/' -UseBasicParsing -TimeoutSec 10).StatusCode
```

Expected: `200`。记下：**这个进程跑着当前对话，绝不 kill/重启它。**

---

### Task 1: 初始化 git 仓库（建立回滚点）

**Files:**
- Create: `.git/`（git init 生成）
- Create: `.gitignore`

- [ ] **Step 1: 写入 .gitignore**

用 Write 工具创建 `C:\Users\shenkang\.dsh\plugins\dsh-catppuccin-theme\.gitignore`，内容：

```gitignore
node_modules/
```

- [ ] **Step 2: git init + 基线提交**

Run:

```powershell
cd 'C:\Users\shenkang\.dsh\plugins\dsh-catppuccin-theme'
git init
git add -A
git commit -m "chore: baseline v0.2.6 before loading-page feature"
```

Expected: 提交成功，工作区干净（`git status` 无未提交文件）。

---

### Task 2: 编写失败测试

**Files:**
- Create: `test/splash.test.js`

- [ ] **Step 1: 写入完整测试文件**

用 Write 工具创建 `C:\Users\shenkang\.dsh\plugins\dsh-catppuccin-theme\test\splash.test.js`，内容（完整，无省略）：

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DOT_COLORS,
  SPLASH_PALETTE,
  injectSplash,
  scopeSvg,
  splashFlavor,
  splashMarkup,
  splashStyle
} from '../lib/splash.js'

const SAMPLE_HTML = '<!doctype html><html><head><title>t</title></head><body><div id="root"></div></body></html>'
const SAMPLE_SVG = '<svg viewBox="0 0 1042 1042" height="40">'
  + '<style>:root{--logo-mauve:#cba6f7} #red{animation-delay:-1s} #mauve{animation-delay:0s} .is-animated{animation:3s rainbow infinite running}</style>'
  + '<path id="mauve" class="is-animated" fill="var(--logo-mauve)" d="M0 0"/>'
  + '<path id="body" fill="var(--mantle)" d="M1 1"/>'
  + '</svg>'

test('splashFlavor: 合法 flavor 原样返回', () => {
  assert.equal(splashFlavor('mocha'), 'mocha')
  assert.equal(splashFlavor('latte'), 'latte')
  assert.equal(splashFlavor('macchiato'), 'macchiato')
  assert.equal(splashFlavor('frappe'), 'frappe')
})

test('splashFlavor: 非法/缺省回退 mocha', () => {
  assert.equal(splashFlavor('nope'), 'mocha')
  assert.equal(splashFlavor(''), 'mocha')
  assert.equal(splashFlavor(undefined), 'mocha')
  assert.equal(splashFlavor(null), 'mocha')
})

test('scopeSvg: 选择器改写为 #cppc-splash 作用域', () => {
  const out = scopeSvg(SAMPLE_SVG)
  assert.ok(out.includes('#cppc-splash{--logo-mauve:#cba6f7}'))
  assert.ok(out.includes('#cppc-splash #red{animation-delay:-1s}'))
  assert.ok(out.includes('#cppc-splash .is-animated{animation:3s rainbow infinite running}'))
})

test('scopeSvg: 移除内联 height，保留 id 属性', () => {
  const out = scopeSvg(SAMPLE_SVG)
  assert.ok(!out.includes('height="40"'))
  assert.ok(out.includes('id="mauve"'))
  assert.ok(out.includes('id="body"'))
})

test('injectSplash: logo 为空/非法时原样返回', () => {
  assert.equal(injectSplash(SAMPLE_HTML, 'mocha', null), SAMPLE_HTML)
  assert.equal(injectSplash(SAMPLE_HTML, 'mocha', undefined), SAMPLE_HTML)
  assert.equal(injectSplash(SAMPLE_HTML, 'mocha', '   '), SAMPLE_HTML)
})

test('injectSplash: mocha 注入位置与内容', () => {
  const out = injectSplash(SAMPLE_HTML, 'mocha', SAMPLE_SVG)
  // 紧跟 <body> 之后注入
  assert.ok(out.startsWith('<!doctype html><html><head><title>t</title></head><body><style>'))
  assert.ok(out.endsWith('<div id="root"></div></body></html>'))
  // splash 根节点 + 内联 logo
  assert.ok(out.includes('<div id="cppc-splash"'))
  assert.ok(out.includes('id="mauve"'))
  // 四个呼吸点（身份色）
  for (const color of DOT_COLORS) assert.ok(out.includes('background:' + color))
  // 自愈脚本关键点
  assert.ok(out.includes('__cppc_splash_dismiss'))
  assert.ok(out.includes('HARNESS'))
  assert.ok(out.includes('Failed to load plugins'))
  assert.ok(out.includes('12000'))
})

test('injectSplash: mocha 配色进入样式', () => {
  const out = injectSplash(SAMPLE_HTML, 'mocha', SAMPLE_SVG)
  assert.ok(out.includes('--mantle:#181825'))
  assert.ok(out.includes('--text:#cdd6f4'))
  assert.ok(out.includes('--red:#f38ba8'))
  assert.ok(out.includes('background:#1e1e2e'))
})

test('injectSplash: latte 配色', () => {
  const out = injectSplash(SAMPLE_HTML, 'latte', SAMPLE_SVG)
  assert.ok(out.includes('background:#f6f7f9'))
  assert.ok(out.includes('--mantle:#eef0f4'))
  assert.ok(out.includes('--text:#4c4f69'))
  assert.ok(out.includes('--red:#d20f39'))
})

test('injectSplash: 非法 flavor 回退 mocha 配色', () => {
  const out = injectSplash(SAMPLE_HTML, 'weird', SAMPLE_SVG)
  assert.ok(out.includes('background:#1e1e2e'))
})

test('injectSplash: 无 body 片段时追加到末尾', () => {
  const fragment = '<div>hello</div>'
  const out = injectSplash(fragment, 'mocha', SAMPLE_SVG)
  assert.ok(out.startsWith('<div>hello</div><style>'))
  assert.ok(out.includes('id="cppc-splash"'))
})

test('splashStyle: 尺寸/动画/降级动效齐全', () => {
  const style = splashStyle('mocha')
  assert.ok(style.includes('position:fixed'))
  assert.ok(style.includes('width:150px;height:150px'))
  assert.ok(style.includes('cppc-breath'))
  assert.ok(style.includes('prefers-reduced-motion'))
  assert.ok(style.includes('z-index:2147483000'))
})

test('splashMarkup: 包含全部四个点且顺序稳定', () => {
  const markup = splashMarkup(scopeSvg(SAMPLE_SVG))
  const first = markup.indexOf('cppc-dot')
  const last = markup.lastIndexOf('cppc-dot')
  assert.ok(first > 0 && last > first)
  assert.equal((markup.match(/cppc-dot"/g) || []).length, 4)
})

test('SPLASH_PALETTE: 四个 flavor 键齐全', () => {
  for (const id of ['latte', 'frappe', 'macchiato', 'mocha']) {
    const c = SPLASH_PALETTE[id]
    assert.equal(typeof c.base, 'string')
    assert.equal(typeof c.mantle, 'string')
    assert.equal(typeof c.text, 'string')
    assert.equal(typeof c.red, 'string')
  }
})
```

- [ ] **Step 2: 运行测试，确认失败**

Run:

```powershell
cd 'C:\Users\shenkang\.dsh\plugins\dsh-catppuccin-theme'
node --test test/
```

Expected: 全部失败，报错为 `Cannot find module '...\lib\splash.js'`（模块尚不存在）。若报别的错，停下来排查测试文件本身。

---

### Task 3: 实现 lib/splash.js

**Files:**
- Create: `lib/splash.js`

- [ ] **Step 1: 写入完整实现**

用 Write 工具创建 `C:\Users\shenkang\.dsh\plugins\dsh-catppuccin-theme\lib\splash.js`，内容（完整，无省略）：

```js
/**
 * dsh-catppuccin-theme 首屏 loading 页 —— 宿主侧纯函数模块。
 *
 * 由 lib/index.js 在 webServer.tapIndex 变换中调用；本模块不依赖
 * Cordis / schemastery，可被 node:test 直接测试。
 *
 * 职责：
 *  - 按已保存 flavor 产出 splash 的 <style> / 标记 / 自愈脚本；
 *  - 把 logo.svg 原文件内联进首屏 HTML 并改写其 CSS 选择器作用域；
 *  - logo 缺失或 flavor 非法时安全降级（不注入 / 默认 Mocha）。
 */

/** splash 可用的 flavor 及其所需子集色（与 lib/client.js 的 PALETTE 同源）。 */
export const SPLASH_PALETTE = {
  latte: { base: '#f6f7f9', mantle: '#eef0f4', text: '#4c4f69', red: '#d20f39' },
  frappe: { base: '#303446', mantle: '#292c3c', text: '#c6d0f5', red: '#e78284' },
  macchiato: { base: '#24273a', mantle: '#1e2030', text: '#cad3f5', red: '#ed8796' },
  mocha: { base: '#1e1e2e', mantle: '#181825', text: '#cdd6f4', red: '#f38ba8' }
}

/** 呼吸点：四个 flavor 的身份色（固定，不随当前 flavor 切换）。 */
export const DOT_COLORS = ['#dd7878', '#8caaee', '#8aadf4', '#cba6f7']

/** 合法 flavor 原样返回，否则（含 undefined/null）回退 mocha。 */
export function splashFlavor(raw) {
  return Object.prototype.hasOwnProperty.call(SPLASH_PALETTE, raw) ? raw : 'mocha'
}

/**
 * 把 logo.svg 内部 CSS 的作用域收敛到 #cppc-splash，避免污染页面：
 *  - `:root`           → `#cppc-splash`
 *  - `#red` 等 id 选择器 → `#cppc-splash #red`
 *  - `.is-animated`    → `#cppc-splash .is-animated`
 * 并移除内联 height 属性（尺寸交给外层 CSS 固定 150px）。
 */
export function scopeSvg(svg) {
  return svg
    .replace(/:root\b/g, '#cppc-splash')
    .replace(/#(red|peach|yellow|green|sapphire|mauve)\b/g, '#cppc-splash #$1')
    .replace(/\.is-animated\b/g, '#cppc-splash .is-animated')
    .replace(/\sheight="40"/, '')
}

/** splash 覆盖层样式（颜色为当前 flavor 的具体值）。 */
export function splashStyle(flavorId) {
  const c = SPLASH_PALETTE[flavorId]
  const dotDelays = DOT_COLORS.map((_, i) =>
    '#cppc-splash .cppc-dot:nth-child(' + (i + 1) + '){animation-delay:' + i * 0.2 + 's}').join('')
  return [
    '#cppc-splash{--mantle:' + c.mantle + ';--text:' + c.text + ';--red:' + c.red + ';'
      + 'position:fixed;inset:0;z-index:2147483000;display:flex;flex-direction:column;'
      + 'align-items:center;justify-content:center;gap:22px;background:' + c.base
      + ';opacity:1;transition:opacity .25s ease}',
    '#cppc-splash.dismissing{opacity:0;pointer-events:none}',
    '#cppc-splash svg{display:block;width:150px;height:150px}',
    '#cppc-splash .cppc-dots{display:flex;gap:10px}',
    '#cppc-splash .cppc-dot{width:10px;height:10px;border-radius:50%;animation:cppc-breath 1.6s ease-in-out infinite}',
    dotDelays,
    '@keyframes cppc-breath{0%,100%{transform:scale(1);opacity:.5}50%{transform:scale(1.4);opacity:1}}',
    '@media (prefers-reduced-motion: reduce){#cppc-splash .cppc-dot{animation:none}#cppc-splash .is-animated{animation:none !important}}'
  ].join('')
}

/** splash 主体标记：内联 logo + 四个呼吸点。 */
export function splashMarkup(scopedSvg) {
  const dots = DOT_COLORS.map((color) =>
    '<span class="cppc-dot" style="background:' + color + '"></span>').join('')
  return '<div id="cppc-splash" role="status" aria-label="DeepSeek Harness 加载中">'
    + scopedSvg
    + '<div class="cppc-dots" aria-hidden="true">' + dots + '</div></div>'
}

/**
 * splash 自愈脚本（IIFE 字符串）：内核 boot 卡片卸载（含 HARNESS 字样）
 * 或出现 "Failed to load plugins" 或 12s 超时 → 移除 splash。
 * 注意：本字符串内不得出现字面量 `</script>`。
 */
export const SPLASH_SCRIPT = `(function () {
  var el = document.getElementById('cppc-splash')
  if (!el) return
  var done = false
  function removeNow() {
    if (el && el.parentNode) el.parentNode.removeChild(el)
    el = null
  }
  function dismiss() {
    if (done) return
    done = true
    try {
      if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) { removeNow(); return }
    } catch (e) {}
    if (el) el.classList.add('dismissing')
    setTimeout(removeNow, 260)
  }
  window.__cppc_splash_dismiss = dismiss
  function hasText(nodes, text) {
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i]
      if (!n) continue
      var s = n.nodeType === 3 ? n.nodeValue : n.textContent
      if (s && s.indexOf(text) !== -1) return true
    }
    return false
  }
  var root = document.getElementById('root')
  if (root && typeof MutationObserver !== 'undefined') {
    try {
      var observer = new MutationObserver(function (mutations) {
        for (var i = 0; i < mutations.length; i++) {
          var m = mutations[i]
          if (hasText(m.removedNodes, 'HARNESS')) { observer.disconnect(); dismiss(); return }
          if (hasText(m.addedNodes, 'Failed to load plugins')) { observer.disconnect(); removeNow(); return }
        }
      })
      observer.observe(root, { childList: true, subtree: true })
    } catch (e) {}
  }
  setTimeout(dismiss, 12000)
})()`

/**
 * 把完整 splash（样式 + 标记 + 自愈脚本）注入首屏 HTML：
 * 紧跟 <body ...> 开标签之后；无 body 的片段追加到末尾。
 * logoSvg 为空/非法时原样返回 html（安全降级，不注入）。
 */
export function injectSplash(html, flavorId, logoSvg) {
  if (typeof html !== 'string' || typeof logoSvg !== 'string' || logoSvg.trim() === '') return html
  const safeFlavor = splashFlavor(flavorId)
  const payload = '<style>' + splashStyle(safeFlavor) + '</style>'
    + splashMarkup(scopeSvg(logoSvg))
    + '<script>' + SPLASH_SCRIPT + '</script>'
  const body = /<body(?:\s[^>]*)?>/i.exec(html)
  if (body === null) return html + payload
  const at = body.index + body[0].length
  return html.slice(0, at) + payload + html.slice(at)
}
```

- [ ] **Step 2: 运行测试，确认全部通过**

Run:

```powershell
cd 'C:\Users\shenkang\.dsh\plugins\dsh-catppuccin-theme'
node --test test/
```

Expected: 13 个测试全部 PASS。

---

### Task 4: 提交纯函数模块

- [ ] **Step 1: 提交**

Run:

```powershell
cd 'C:\Users\shenkang\.dsh\plugins\dsh-catppuccin-theme'
git add test/splash.test.js lib/splash.js
git commit -m "feat: add first-screen splash pure module with tests"
```

Expected: 提交成功，`git status` 干净。

---

### Task 5: 接线 lib/index.js 与 package.json

**Files:**
- Modify: `lib/index.js`（整体替换为下文内容）
- Modify: `package.json`（三处小改）

- [ ] **Step 1: 替换 lib/index.js**

用 Write 工具整体替换 `C:\Users\shenkang\.dsh\plugins\dsh-catppuccin-theme\lib\index.js`，内容（完整，无省略）：

```js
/**
 * dsh-catppuccin-theme 宿主半。
 *
 * 职责：
 *  1. 向 Host 设置文档注册 `dsh-catppuccin-theme` 命名空间；
 *  2. 提供 `catppuccinTheme` 服务（typertRemote 绑定，配合 ./typert 清单
 *     走 Typert 网关），客户端经 `ctx.get('remote.catppuccinTheme')`
 *     调用 load/save —— 宿主侧直写设置文档，不经 api-proxy 的
 *     配置客户端暴露白名单（该白名单为硬编码，settings.register 自暴露
 *     尚未实现）。
 *  3. 经 webServer.tapIndex 在每次 index.html 响应中注入 Catppuccin
 *     首屏 loading 页（内联 logo.svg + 呼吸点 + 自愈脚本），
 *     logo 缺失时安全降级为默认 loading。
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import z from '@deepseek-ai/schemastery'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import { injectSplash } from './splash.js'

/** 稳定插件名（Loader 行 id 之外的包内标识）。 */
export const name = 'catppuccin-theme'

/** 与浏览器端 SETTINGS_NS 对应的设置命名空间。 */
const SETTINGS_NS = settingsNamespace('dsh-catppuccin-theme')

/** logo.svg 绝对路径（与 index.js 同目录）。 */
const LOGO_PATH = join(dirname(fileURLToPath(import.meta.url)), 'logo.svg')

/** 个性化设置 schema；默认值保证快照始终完整。 */
const PersoSettingsSchema = z.object({
  flavor: z.string().default('mocha'),
  accent: z.string().default('mauve'),
  uiFont: z.string().default(''),
  codeFont: z.string().default(''),
  appliedUi: z.string().default(''),
  appliedCode: z.string().default('')
})

/**
 * 创建 catppuccinTheme 服务对象。手写 `typertRemote` 绑定
 * （service/serviceKey/namespace），与 ./typert.host.js 清单一致。
 */
function createService(ctx) {
  const section = () => ctx.settings.get(SETTINGS_NS) ?? {}
  const service = {
    /** 读取当前完整设置。 */
    load() {
      return { ...section() }
    },
    /** 合并一份补丁并持久化，返回更新后的完整设置。 */
    async save(patch) {
      const current = section()
      const next = { ...current }
      if (patch !== null && typeof patch === 'object' && !Array.isArray(patch)) {
        for (const key of Object.keys(patch)) next[key] = patch[key]
      }
      await ctx.settings.update(SETTINGS_NS, next)
      return { ...section() }
    }
  }
  Object.defineProperty(service, 'typertRemote', {
    value: { service, serviceKey: 'catppuccinTheme', namespace: 'catppuccinTheme' }
  })
  return service
}

/**
 * 注册设置命名空间并挂载 RPC 服务；同时注册首屏 splash 注入。
 * settings 服务由宿主进程提供（可选依赖，缺失时静默跳过——Web 环境始终存在）。
 */
export function apply(ctx) {
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.register(SETTINGS_NS, PersoSettingsSchema)
    settingsCtx.provide('catppuccinTheme', createService(settingsCtx))
  })
  ctx.inject(['webServer'], (httpCtx) => {
    httpCtx.effect(() => httpCtx.webServer.tapIndex((html) => {
      let logoSvg = null
      try {
        logoSvg = readFileSync(LOGO_PATH, 'utf8')
      } catch {
        // logo.svg 缺失/不可读 → injectSplash 原样返回，回退默认 loading
      }
      const settings = ctx.get('settings')
      const section = settings !== undefined ? (settings.get(SETTINGS_NS) ?? {}) : {}
      return injectSplash(html, section.flavor, logoSvg)
    }), 'catppuccin-theme: boot splash')
  })
}
```

- [ ] **Step 2: 修改 package.json 三处**

用 Edit 工具对 `C:\Users\shenkang\.dsh\plugins\dsh-catppuccin-theme\package.json` 做三处修改：

改 1（version 0.2.6 → 0.3.0）：

```json
  "version": "0.3.0",
```

改 2（files 数组加 logo.svg，放在 `"lib"` 之后）：

```json
  "files": [
    "lib",
    "logo.svg",
    "cordis.patch.yml"
  ],
```

改 3（新增 scripts 字段，放在 `"license": "MIT",` 之后）：

```json
  "scripts": {
    "test": "node --test test/"
  },
```

- [ ] **Step 3: 验证模块可加载 + 全测试绿**

Run:

```powershell
cd 'C:\Users\shenkang\.dsh\plugins\dsh-catppuccin-theme'
node -e "import('./lib/index.js').then(m => { console.log('name=' + m.name) })"
npm test
```

Expected: 第一行输出 `name=catppuccin-theme`（无异常）；`npm test` 输出 13 个测试全部 PASS。

- [ ] **Step 4: 提交**

Run:

```powershell
cd 'C:\Users\shenkang\.dsh\plugins\dsh-catppuccin-theme'
git add lib/index.js package.json package-lock.json
git commit -m "feat: wire catppuccin splash into web index taps"
```

Expected: 提交成功。`package-lock.json` 若无变化（version 变更会进 lock），`git add` 忽略即可。

---

### Task 6: 交付与用户侧重启验收（不自动执行重启）

**Files:** 无

- [ ] **Step 1: 自查产物清单**

Run:

```powershell
cd 'C:\Users\shenkang\.dsh\plugins\dsh-catppuccin-theme'
git status
git log --oneline -3
```

Expected: 工作区干净；最近三条提交为 baseline / feat: splash 模块 / feat: wire。

- [ ] **Step 2: 提示用户重启 dsh web 并验收**

**执行者不得自己重启服务器**（会杀掉当前会话）。向用户给出以下说明，由用户在其终端操作：

1. 重启：`Ctrl+C` 结束当前 `dsh web` 进程，用平时的启动命令重新运行；
2. 打开/刷新 `http://127.0.0.1:3080/`；
3. 验收清单：
   - 刷新瞬间第一帧即 Catppuccin 底色 + LOGO + 四个呼吸点，无白屏；
   - 启动完成后 250ms 内淡出进入界面；
   - 设置页切换 flavor（Latte/Frappé/Macchiato/Mocha）后刷新，首屏底色/猫脸/领结跟随；
   - （可选）把 `logo.svg` 临时改名后刷新 → 回退默认白底 loading、无报错，改回后恢复。

- [ ] **Step 3: 自动化冒烟（用户重启完成后执行）**

Run:

```powershell
$html = (Invoke-WebRequest -Uri 'http://127.0.0.1:3080/' -UseBasicParsing -TimeoutSec 10).Content
$html -match 'id="cppc-splash"' -and $html -match '__cppc_splash_dismiss' -and $html -match 'cppc-breath'
```

Expected: `True`。若为 `False`，说明宿主变更未生效（未重启）或注入异常，回到 Task 5 排查。

---

## 回滚

任一步骤失败需要回到初始状态时：

```powershell
cd 'C:\Users\shenkang\.dsh\plugins\dsh-catppuccin-theme'
git checkout -- .
```

（保留 git 提交历史，仅丢弃工作区改动；彻底回滚到基线可用 `git reset --hard` 到 baseline 提交。）

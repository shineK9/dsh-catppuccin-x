#!/usr/bin/env node
/**
 * 从 DeepSeek Harness 的 app.asar 里抽取主题 token，生成 docs/reference 下的
 * dsh-theme-tokens.md（完整分组表）与 dsh-theme-tokens.html（可搜索查看器）。
 *
 * 用法（仓库根目录）：
 *   node scripts/extract-theme-tokens.mjs "<path-to-app.asar>"
 *
 * 抽取来源：
 *  1. 内置主题样式：body / body[data-ds-dark-theme] / :root 里的 token 定义
 *     （浅色 + 深色两套值）；
 *  2. 组件 CSS 里直接消费、但没有全局定义的变量（var(--x, fallback)）；
 *  3. 本插件 lib/client.js 已经覆盖的 token（表里标 ✓ / 插件徽章）。
 *
 * DSH 升级后重新跑一次即可刷新文档；token 只增不减时旧文档也可继续参考。
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const asarPath = process.argv[2] || process.env.DSH_ASAR
if (!asarPath) {
  console.error('usage: node scripts/extract-theme-tokens.mjs "<path-to-app.asar>"')
  process.exit(2)
}

const asar = readFileSync(asarPath, 'utf8')
const plugin = readFileSync(resolve(root, 'lib/client.js'), 'utf8')

// ── 1. 内置主题的浅色 / 深色 token ─────────────────────────────────────────
function readBlock(start) {
  let depth = 0
  let end = -1
  for (let i = start; i < asar.length; i++) {
    if (asar[i] === '{') depth++
    else if (asar[i] === '}') {
      depth--
      if (depth === 0) { end = i; break }
    }
  }
  return asar.slice(start, end + 1)
}
function parseDecls(css) {
  const map = new Map()
  const re = /(--[a-zA-Z0-9-]+)\s*:\s*([^;]+);/g
  let m
  while ((m = re.exec(css))) map.set(m[1], m[2].trim())
  return map
}

const anchor = asar.indexOf('body{--dsw-alias-bg-base:')
if (anchor < 0) {
  console.error('could not locate the built-in theme tokens in this asar')
  process.exit(1)
}
const regionStart = Math.max(0, anchor - 120000)
const region = asar.slice(regionStart, Math.min(asar.length, anchor + 100000))
const selectorRe = /(body\[data-ds-dark-theme\]|body|:root)\{/g
const light = new Map()
const dark = new Map()
let match
while ((match = selectorRe.exec(region))) {
  const block = readBlock(regionStart + match.index)
  const target = match[1] === 'body[data-ds-dark-theme]' ? dark : light
  for (const [name, value] of parseDecls(block)) if (!target.has(name)) target.set(name, value)
}

// ── 2. 组件 CSS 里仅被消费（无全局定义）的变量 ─────────────────────────────
const usedOnly = new Map()
const useRe = /var\((--(?:dsw|dsh|ds)-[a-z0-9-]+)(?:\s*,\s*([^()]*(?:\([^()]*\)[^()]*)*))?\)/g
while ((match = useRe.exec(asar))) {
  if (!usedOnly.has(match[1])) usedOnly.set(match[1], (match[2] || '').trim())
}

// 组件里带默认值的 --dsh / --ds 定义（如 --dsh-chat-flow-gap:12px）
const componentDefs = new Map()
const componentRe = /(--(?:dsh|ds)-[a-z0-9-]+)\s*:\s*([^;}"]{1,140})/g
while ((match = componentRe.exec(asar))) {
  if (!componentDefs.has(match[1])) componentDefs.set(match[1], match[2].trim())
}

// ── 3. 本插件已覆盖的 token ────────────────────────────────────────────────
const pluginTokens = new Set()
const pluginRe = /'(--[a-z0-9-]+)'\s*:/g
while ((match = pluginRe.exec(plugin))) pluginTokens.add(match[1])

// ── 4. 合并 + 分组 + 色块 ──────────────────────────────────────────────────
const tint = (color, pct, base) => 'color-mix(in srgb, ' + color + ' ' + pct + '%, ' + (base || 'transparent') + ')'
const staticLight = new Map([...light].filter(([name]) => name.startsWith('--dsw-static-')))
const staticDark = new Map([...dark].filter(([name]) => name.startsWith('--dsw-static-')))
function resolveStatic(value, statics, depth = 0) {
  if (!value || depth > 3) return undefined
  const text = value.trim()
  if (/^#[0-9a-f]{3,8}$/i.test(text)) return text
  const ref = /^var\((--[a-z0-9-]+)\)$/.exec(text)
  if (ref) {
    const next = statics.get(ref[1]) || light.get(ref[1]) || dark.get(ref[1])
    return next ? resolveStatic(next, statics, depth + 1) : undefined
  }
  return undefined
}
function groupOf(name) {
  if (name.startsWith('--cppc-')) return 'plugin'
  if (name.startsWith('--dsw-alias-')) return 'alias'
  if (name.startsWith('--dsw-specific-')) return 'specific'
  if (name.startsWith('--dsw-static-')) return 'static'
  if (/^--(dsw|dsh|ds)-font/.test(name)) return 'font'
  if (/^--(dsw-(radius|shadow|elevation|mask|corner)|ds-(ease|transition))/.test(name)) return 'shape'
  if (/^--dsh-/.test(name)) return 'component'
  return 'other'
}
const isUsable = (value) => typeof value === 'string' && value.length > 0 && !value.includes('`') && !value.includes('${') && !/\s=\s/.test(value)

const merged = new Map()
for (const [name, value] of light) merged.set(name, { name, group: groupOf(name), light: value, dark: dark.get(name) })
for (const [name, value] of dark) if (!merged.has(name)) merged.set(name, { name, group: groupOf(name), dark: value })
for (const [name, value] of componentDefs) if (!merged.has(name)) merged.set(name, { name, group: groupOf(name), value: value || '（组件默认值）' })
for (const [name, value] of usedOnly) if (!merged.has(name)) merged.set(name, { name, group: 'used', value: value || '（var 回退值）' })
for (const name of pluginTokens) if (!merged.has(name)) merged.set(name, { name, group: 'plugin', value: '（插件注入）' })

const tokens = [...merged.values()]
  .filter((token) => [token.light, token.dark, token.value].some((value) => value !== undefined && isUsable(value)))
  .map((token) => ({
    name: token.name,
    group: token.group,
    light: token.light && isUsable(token.light) ? token.light : undefined,
    dark: token.dark && isUsable(token.dark) ? token.dark : undefined,
    value: !token.light && !token.dark && token.value ? token.value : undefined,
    swatch: resolveStatic(token.light ?? token.value, staticLight) || resolveStatic(token.dark ?? token.value, staticDark) || undefined,
    plugin: pluginTokens.has(token.name)
  }))

// ── 5. 生成 Markdown ──────────────────────────────────────────────────────
const GROUPS = [
  ['alias', '语义别名 alias', '--dsw-alias-*', '组件读取的语义 token：文字/背景/边框/品牌/状态/滚动条/markdown 等'],
  ['specific', '组件专用 specific', '--dsw-specific-*', '特定组件专用：气泡、输入框、侧栏、菜单、选择器等'],
  ['component', '布局 & 组件变量', '--dsh-*', '组件自己定义、可在作用域内覆盖的变量：会话宽度、字号、流间距、滚动条、composer 等'],
  ['used', '仅在组件中消费', 'var(--dsw-*) / var(--dsh-*)', '没有全局定义、只作为 var() 回退值或运行时由组件写入的变量，覆盖后同样生效'],
  ['shape', '圆角 / 阴影 / 过渡', '--dsw-radius-* / --dsw-shadow-* / --ds-transition-*', '圆角、阴影层级、focus ring、遮罩、缓动与时长'],
  ['other', '渐变 / 滚动条 / 其他', '其余 --dsw-*', '渐变、菜单表面、滚动条初始化值、shiki 代码高亮配色等'],
  ['font', '字体排印 font', '--dsw-font-*', 'markdown 标题/正文、代码、brand 字体等字体 shorthand 与分项 token'],
  ['static', '静态色板 static', '--dsw-static-*', '原始色阶（neutral / neutral-bluish / blue / deepseek / red / green / amber），alias 的取值来源'],
  ['plugin', '插件私有', '--cppc-*', 'dsh-catppuccin-x 自己的变量（流光三色、hovercard 等）']
]
// 「全部」视图按分组顺序展示（语义 token 在前，字体/静态色板在后）。
const groupOrder = GROUPS.map(([id]) => id)
tokens.sort((a, b) => groupOrder.indexOf(a.group) - groupOrder.indexOf(b.group) || a.name.localeCompare(b.name))
const escapeCell = (value) => String(value ?? '').replace(/\|/g, '\\|')
const lines = []
lines.push('# DSH 可覆盖 Token 总表')
lines.push('')
lines.push('> 来源：DeepSeek Harness 内置主题样式（`body` / `body[data-ds-dark-theme]` / `:root`）+ 组件 CSS 实际消费的变量 + 插件 `dsh-catppuccin-x` 的 `lib/client.js`。')
lines.push('> 共 **' + tokens.length + '** 个 token；✓ 表示当前 catppuccin-x 插件已经在覆盖它。')
lines.push('> 生成方式：`node scripts/extract-theme-tokens.mjs "<path-to-app.asar>"`（DSH 升级后重跑即可刷新）。')
lines.push('')
lines.push('说明：CSS 自定义属性理论上都能覆盖，但只有被内置样式实际消费的才会生效；本表只收内置样式**实际定义/使用**的 token。覆盖方式：主题 `theme.register({ tokens })`、强调色层 `theme.overrideTokens()`，或插件 CSS 里按作用域写 `--token: value`。')
lines.push('')
lines.push('## 分组概览')
lines.push('')
lines.push('| 分组 | 数量 | token 前缀 | 用途 |')
lines.push('| --- | ---: | --- | --- |')
for (const [key, label, prefix, note] of GROUPS) {
  lines.push('| ' + label + ' | ' + tokens.filter((token) => token.group === key).length + ' | `' + prefix + '` | ' + note + ' |')
}
lines.push('')
for (const [key, label] of GROUPS) {
  const rows = tokens.filter((token) => token.group === key)
  if (rows.length === 0) continue
  lines.push('## ' + label + '（' + rows.length + '）')
  lines.push('')
  lines.push('| Token | 浅色 | 深色 | 插件 |')
  lines.push('| --- | --- | --- | :---: |')
  for (const token of rows) {
    lines.push('| `' + token.name + '` | ' + escapeCell(token.light ?? token.value ?? '') + ' | ' + escapeCell(token.dark ?? '') + ' | ' + (token.plugin ? '✓' : '') + ' |')
  }
  lines.push('')
}
lines.push('## 会话 / 气泡相关速查')
lines.push('')
lines.push('改聊天气泡时最先会用到的一批（完整值见上表）：')
lines.push('')
lines.push('| Token | 作用 | 内置默认值（浅色） |')
lines.push('| --- | --- | --- |')
const bubbleNotes = {
  '--dsw-specific-bubble': '用户消息气泡底色',
  '--dsw-specific-bubble-highlight': '气泡高亮 / 选中态',
  '--dsw-radius-xl': '气泡圆角（在 `[data-chat-flow-kind=user]` 上局部覆盖即可只影响气泡）',
  '--dsw-alias-label-primary': '气泡文字色',
  '--dsw-alias-label-primary-foreground': '品牌底上的字色（按钮/徽章）',
  '--dsw-alias-bg-layer-1': '卡片 / 输入框底',
  '--dsw-alias-border-l1': '细分隔线',
  '--dsw-alias-border-l2': '常规边框',
  '--dsw-alias-markdown-code-block': '代码块底',
  '--dsw-alias-markdown-inline-code': '行内代码底',
  '--dsh-chat-content-width': '会话内容列宽（用户气泡叠了 .702 系数）',
  '--dsh-content-font-size': '正文字号（气泡与消息共用）',
  '--dsh-chat-flow-gap': '消息行间距',
  '--dsh-scrollbar-thumb': '滚动条滑块颜色'
}
for (const [name, note] of Object.entries(bubbleNotes)) {
  const token = tokens.find((item) => item.name === name)
  const value = token ? (token.light ?? token.value ?? '') : '未收录'
  lines.push('| `' + name + '` | ' + note + ' | ' + escapeCell(value) + ' |')
}
lines.push('')
lines.push('> 气泡本体没有 data 属性、类名是构建哈希（如 `LOmM4q_bubble`），样式覆盖建议用 `[data-chat-flow-kind="user"]` 作用域 + `[class*="_bubble"]` 兜底。')
lines.push('')
mkdirSync(resolve(root, 'docs/reference'), { recursive: true })
writeFileSync(resolve(root, 'docs/reference/dsh-theme-tokens.md'), lines.join('\n'), 'utf8')

// ── 6. 生成可搜索 HTML ────────────────────────────────────────────────────
const META = GROUPS.map(([id, label]) => [id, label])
const counts = {}
for (const token of tokens) counts[token.group] = (counts[token.group] || 0) + 1
const chips = [['all', '全部', tokens.length]].concat(META.map(([id, label]) => [id, label, counts[id] || 0]))
const html = [
  '<!doctype html>',
  '<html lang="zh-CN"><head><meta charset="utf-8">',
  '<meta name="viewport" content="width=device-width, initial-scale=1">',
  '<title>DSH 可覆盖 Token 总表（' + tokens.length + '）</title>',
  '<style>',
  ':root{color-scheme:light dark;--bg:#fbfcfe;--panel:#fff;--fg:#3d4a63;--muted:#667390;--line:#dde6f2;--accent:#fe640b;--chip:#eef2f8}',
  '@media (prefers-color-scheme: dark){:root{--bg:#1e1e2e;--panel:#181825;--fg:#cdd6f4;--muted:#a6adc8;--line:#313244;--accent:#fab387;--chip:#313244}}',
  '*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:13px/1.5 "Inter","Segoe UI","Microsoft YaHei",sans-serif}',
  'header{padding:22px 24px 10px;max-width:1180px;margin:0 auto}',
  'h1{margin:0 0 6px;font-size:18px}p.sub{margin:0;color:var(--muted);font-size:12px;line-height:1.7;max-width:86ch}',
  '.bar{position:sticky;top:0;z-index:2;display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:12px 24px;background:color-mix(in srgb,var(--bg) 88%,transparent);backdrop-filter:blur(8px);border-bottom:1px solid var(--line);margin-top:12px}',
  'input[type=search]{flex:1;min-width:220px;padding:7px 11px;border-radius:9px;border:1px solid var(--line);background:var(--panel);color:var(--fg);font:inherit}',
  'input[type=search]:focus{outline:2px solid color-mix(in srgb,var(--accent) 45%,transparent);outline-offset:1px}',
  '.chip{border:1px solid var(--line);background:var(--panel);color:var(--muted);border-radius:999px;padding:4px 10px;font:inherit;font-size:12px;cursor:pointer}',
  '.chip[aria-pressed=true]{color:var(--fg);border-color:var(--accent);background:color-mix(in srgb,var(--accent) 10%,transparent)}',
  '.toggle{display:inline-flex;align-items:center;gap:6px;color:var(--muted);font-size:12px;cursor:pointer}',
  'main{max-width:1180px;margin:0 auto;padding:14px 24px 60px}',
  'table{width:100%;border-collapse:collapse}',
  'th{position:sticky;top:58px;background:var(--bg);text-align:left;font-size:11px;color:var(--muted);font-weight:600;padding:8px;border-bottom:1px solid var(--line)}',
  'td{padding:5px 8px;border-bottom:1px solid color-mix(in srgb,var(--line) 55%,transparent);vertical-align:top}',
  'tr:hover td{background:color-mix(in srgb,var(--fg) 4%,transparent)}',
  'code{font:12px/1.45 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:var(--fg);white-space:nowrap}',
  '.val{font:11px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:var(--muted);word-break:break-all;max-width:390px}',
  '.sw{display:inline-block;width:11px;height:11px;border-radius:3px;border:1px solid color-mix(in srgb,var(--fg) 25%,transparent);vertical-align:-1px;margin-right:6px}',
  '.badge{display:inline-block;padding:0 6px;border-radius:6px;font-size:10px;line-height:17px;color:#fff;background:var(--accent)}',
  '.empty{padding:40px;text-align:center;color:var(--muted)}',
  '.count{color:var(--muted);font-size:12px;margin-left:auto}',
  '</style></head><body>',
  '<header>',
  '<h1>DSH 可覆盖 Token 总表</h1>',
  '<p class="sub">来源：DeepSeek Harness 内置主题样式（<code>body</code> / <code>body[data-ds-dark-theme]</code> / <code>:root</code>）+ 组件 CSS 实际消费的变量 + 插件 <code>dsh-catppuccin-x</code> 的 <code>lib/client.js</code>。共 <b>' + tokens.length + '</b> 个 token；<span class="badge">插件</span> 标记表示 catppuccin-x 已经在覆盖它。搜索 / 按分组筛选；点击 token 名复制。</p>',
  '</header>',
  '<div class="bar" id="bar">',
  '<input id="q" type="search" placeholder="搜索 token 名或取值，例如 bubble / radius / --dsw-alias-label" autocomplete="off">',
  '<label class="toggle"><input id="only-plugin" type="checkbox"> 只看插件已覆盖</label>',
  '<span class="count" id="count"></span>',
  '</div>',
  '<div class="bar" id="chips" style="position:static;border:0;padding-top:0;backdrop-filter:none;background:transparent">',
  chips.map(([id, label, n]) => '<button class="chip" data-group="' + id + '" aria-pressed="' + (id === 'all') + '">' + label + ' ' + n + '</button>').join('\n'),
  '</div>',
  '<main><table><thead><tr><th style="width:34%">Token</th><th style="width:40%">浅色</th><th>深色</th><th style="width:60px">插件</th></tr></thead><tbody id="rows"></tbody></table><div class="empty" id="empty" hidden>没有匹配的 token</div></main>',
  '<script>',
  'const TOKENS = ' + JSON.stringify(tokens) + ';',
  'let state = { group: "all", q: "", onlyPlugin: false };',
  'const rows = document.getElementById("rows");',
  'const empty = document.getElementById("empty");',
  'const count = document.getElementById("count");',
  'const swatch = (t) => t.swatch ? \'<span class="sw" style="background:\' + t.swatch + \'"></span>\' : "";',
  'const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");',
  'function render(){',
  '  const q = state.q.trim().toLowerCase();',
  '  const list = TOKENS.filter(t =>',
  '    (state.group === "all" || t.group === state.group) &&',
  '    (!state.onlyPlugin || t.plugin) &&',
  '    (!q || t.name.toLowerCase().includes(q) || [t.light, t.dark, t.value].some(v => (v || "").toLowerCase().includes(q)))',
  '  );',
  '  rows.innerHTML = list.map(t => \'<tr>\'',
  '    + \'<td>\' + swatch(t) + \'<code>\' + esc(t.name) + \'</code></td>\'',
  '    + \'<td class="val">\' + esc(t.light ?? t.value ?? "") + \'</td>\'',
  '    + \'<td class="val">\' + esc(t.dark ?? "") + \'</td>\'',
  '    + \'<td>\' + (t.plugin ? \'<span class="badge">插件</span>\' : "") + \'</td></tr>\').join("");',
  '  empty.hidden = list.length > 0;',
  '  count.textContent = "显示 " + list.length + " / " + TOKENS.length;',
  '}',
  'document.getElementById("q").addEventListener("input", (e) => { state.q = e.target.value; render(); });',
  'document.getElementById("only-plugin").addEventListener("change", (e) => { state.onlyPlugin = e.target.checked; render(); });',
  'document.getElementById("chips").addEventListener("click", (e) => {',
  '  const chip = e.target.closest(".chip");',
  '  if (!chip) return;',
  '  state.group = chip.dataset.group;',
  '  document.querySelectorAll(".chip").forEach(c => c.setAttribute("aria-pressed", String(c === chip)));',
  '  render();',
  '});',
  'rows.addEventListener("click", async (e) => {',
  '  const code = e.target.closest("code");',
  '  if (!code) return;',
  '  try { await navigator.clipboard.writeText(code.textContent); code.textContent = "已复制"; setTimeout(render, 700); } catch {}',
  '});',
  'render();',
  '</script>',
  '</body></html>'
].join('\n')
writeFileSync(resolve(root, 'docs/reference/dsh-theme-tokens.html'), html, 'utf8')

const groupCounts = {}
for (const token of tokens) groupCounts[token.group] = (groupCounts[token.group] || 0) + 1
console.log('tokens:', tokens.length, groupCounts)
console.log('docs written: docs/reference/dsh-theme-tokens.md, .html')

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
 * 把 logo.svg `<style>` 块内的 CSS 选择器作用域收敛到 #cppc-splash，
 * 避免污染页面（style 块是选择器唯一出现处，块外的 class/id 属性不动）：
 *  - `:root`           → `#cppc-splash`
 *  - `#red` 等 id 选择器 → `#cppc-splash #red`
 *  - `.is-animated`    → `#cppc-splash .is-animated`
 * 并移除内联 height 属性（尺寸交给外层 CSS 固定 150px）。
 */
export function scopeSvg(svg) {
  const scoped = svg.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, (block) => block
    .replace(/:root\b/g, '#cppc-splash')
    .replace(/#(red|peach|yellow|green|sapphire|mauve)\b/g, '#cppc-splash #$1')
    .replace(/\.is-animated\b/g, '#cppc-splash .is-animated'))
  return scoped.replace(/\s+height=["']40["']/, '')
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
  ].join('\n')
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

/** 定位首个不在 HTML 注释内的 <body ...> 开标签（避免 <!-- <body> --> 误命中）。 */
function findBodyTag(html) {
  const tag = /<body(?:\s[^>]*)?>/gi
  let searchFrom = 0
  for (;;) {
    tag.lastIndex = searchFrom
    const m = tag.exec(html)
    if (m === null) return null
    const prefix = html.slice(0, m.index)
    if (prefix.lastIndexOf('<!--') > prefix.lastIndexOf('-->')) {
      searchFrom = m.index + 1
      continue
    }
    return m
  }
}

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
  const body = findBodyTag(html)
  if (body === null) return html + payload
  const at = body.index + body[0].length
  return html.slice(0, at) + payload + html.slice(at)
}

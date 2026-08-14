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
  assert.ok(out.startsWith('<!doctype html><html><head><title>t</title></head><body><style>'))
  assert.ok(out.endsWith('<div id="root"></div></body></html>'))
  assert.ok(out.includes('<div id="cppc-splash"'))
  assert.ok(out.includes('id="mauve"'))
  for (const color of DOT_COLORS) assert.ok(out.includes('background:' + color))
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

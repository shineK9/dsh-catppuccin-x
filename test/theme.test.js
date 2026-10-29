/**
 * 设置面回归：
 *
 * 1. **字体下线** —— DSH 原生外观设置已支持界面 / 代码字体，插件不再注入
 *    `:root` 字体变量，也不再把字体字段写进设置文档（旧文档里的遗留字段被忽略）。
 * 2. **品牌徽章前景色阈值** —— 徽章 / 主按钮的字色不能按 flavor 明暗一刀切。
 *    浅色 flavor 的 peach（#fe640b）白字 2.98:1、深字（coldbrew text #3d4a63）
 *    2.99:1，几乎打平；pink（#ea76cb）白字 2.64:1、深字 3.04:1，深字明显更清楚。
 *    实现只在深字比白字高出 0.1 个对比度点时才切深字，本测试独立复算对比度，
 *    验证每种 flavor × 强调色都满足这条阈值语义。
 * 3. **执行中文字流光** —— TextShimmer 的 content 改为「蓝 ↔ 强调色 ↔ 紫」三色
 *    渐变并循环流动；旧版 `[data-text-shimmer]` 选择器在 0.2.x 已失效，测试锁定
 *    新结构（[data-shimmer] > span:first-child + 隐藏 [inert] 装饰层）与三色取值。
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const FLAVORS = ['latte', 'coldbrew', 'frappe', 'macchiato', 'mocha']
const ACCENTS = ['mauve', 'blue', 'green', 'peach', 'red', 'pink']

/** 与 lib/client.js 同源的 WCAG 2.x 相对亮度 / 对比度（独立实现，避免自证）。 */
function luminance(hex) {
  const n = parseInt(hex.slice(1), 16)
  const linear = (channel) => {
    const c = channel / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * linear((n >> 16) & 0xff) + 0.7152 * linear((n >> 8) & 0xff) + 0.0722 * linear(n & 0xff)
}
function contrast(a, b) {
  const x = luminance(a)
  const y = luminance(b)
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

async function loadBundle() {
  const source = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')
  let definition = null
  new Function('window', source)({ __ModuleLoader__: { load: (value) => { definition = value } } })
  assert.notEqual(definition, null, 'the bundle must call window.__ModuleLoader__.load')
  return definition
}

/** 只回答 react 的 require。 */
const requireStub = () => ({
  createElement: () => null,
  useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
  useEffect: () => {},
  useRef: () => ({ current: null }),
  Fragment: Symbol('Fragment')
})

/** 最小假 DOM：apply 里的动态样式表只需要 createElement / head.append / remove。 */
async function withFakeDom(run) {
  const head = { children: [] }
  const element = () => {
    const attributes = {}
    const tag = {
      textContent: '',
      getAttribute: (name) => (name in attributes ? attributes[name] : null),
      setAttribute: (name, value) => { attributes[name] = String(value) },
      remove: () => {
        const index = head.children.indexOf(tag)
        if (index >= 0) head.children.splice(index, 1)
      }
    }
    return tag
  }
  const original = globalThis.document
  globalThis.document = {
    head: { append: (tag) => head.children.push(tag) },
    createElement: element,
    querySelector: () => null
  }
  try {
    return await run()
  } finally {
    if (original === undefined) delete globalThis.document
    else globalThis.document = original
  }
}

/**
 * 跑一次 apply，收集注册的主题 token 与强调色 overrideTokens 补丁。
 * load() 返回指定 flavor/accent，让 applySaved 走完恢复分支（syncAccent 才会触发）。
 */
async function probe(flavor, accent) {
  const definition = await loadBundle()
  const registered = []
  const overrides = []
  const themeApi = {
    load: async () => ({ ok: true, value: { flavor, accent } }),
    save: async (patch) => ({ ok: true, value: patch })
  }
  const ctx = {
    effect: (callback) => { const dispose = callback(); return () => { if (typeof dispose === 'function') dispose() } },
    on: () => () => {},
    timeout: () => () => {},
    get: (key) => (key === 'remote.catppuccinTheme' ? themeApi : undefined),
    remote: { $mount: async () => () => {} },
    slots: { inject: () => () => {}, register: () => () => {} },
    theme: {
      register: (theme) => { registered.push(theme); return () => {} },
      overrideTokens: (id, patch) => { overrides.push({ id, patch }); return () => {} },
      getTheme: () => ({ preference: 'catppuccin-' + flavor }),
      setTheme: () => {}
    }
  }
  await withFakeDom(() => definition.factory(requireStub).apply(ctx))
  return { registered, overrides }
}

test('the plugin no longer ships any font override — DSH native font settings own that', async () => {
  const [client, host] = await Promise.all([
    readFile(new URL('../lib/client.js', import.meta.url), 'utf8'),
    readFile(new URL('../lib/index.js', import.meta.url), 'utf8')
  ])
  for (const source of [client, host]) {
    assert.equal(source.includes('--dsw-font-family'), false, 'no :root font-family override')
    assert.equal(source.includes('--ds-font-family-code'), false, 'no code font override')
    assert.equal(/uiFont|codeFont|appliedUi|appliedCode/.test(source), false, 'no persisted font fields')
  }
})

test('the persisted settings schema only carries flavor and accent', async () => {
  const { TYPERT } = await import('../lib/typert.host.js')
  const load = TYPERT.invocations.find((item) => item.method === 'load')
  const parsed = load.result.schema.parse({ flavor: 'latte', accent: 'peach', uiFont: 'Inter', codeFont: 'Mono' })
  assert.deepEqual(Object.keys(parsed).sort(), ['accent', 'flavor'])
})

test('badge / primary foreground picks the higher-contrast ink for every flavor × accent', async () => {
  for (const flavor of FLAVORS) {
    for (const accent of ACCENTS) {
      const { registered, overrides } = await probe(flavor, accent)
      const theme = registered.find((item) => item.id === 'catppuccin-' + flavor)
      assert.ok(theme !== undefined, 'theme must be registered: ' + flavor)

      const override = overrides.find((item) => item.id === 'catppuccin-x-accent')
      const bg = override === undefined
        ? theme.tokens['--dsw-alias-brand-primary']
        : override.patch['--dsw-alias-brand-primary'].light
      const ink = override === undefined
        ? theme.tokens['--dsw-alias-label-primary-foreground']
        : override.patch['--dsw-alias-label-primary-foreground'].light

      // 候选深字：浅色 flavor 用 text、深色 flavor 用 base（与注册的 tokens 同源值）。
      const darkInk = theme.colorScheme === 'light'
        ? theme.tokens['--dsw-alias-label-primary']
        : theme.tokens['--dsw-alias-bg-base']
      const whiteRatio = contrast(bg, '#ffffff')
      const darkRatio = contrast(bg, darkInk)

      if (ink === darkInk) {
        // 切深字的唯一理由：深字比白字高出 0.1 个对比度点。
        assert.ok(darkRatio > whiteRatio + 0.1, `dark ink must be clearly better: ${flavor} + ${accent} (bg ${bg})`)
      } else {
        assert.equal(ink, '#ffffff', `only #fff may be used on the light side: ${flavor} + ${accent}`)
        assert.ok(whiteRatio >= darkRatio - 0.1, `white ink must not be clearly worse: ${flavor} + ${accent} (bg ${bg})`)
      }
    }
  }
})

test('the reported case — coldbrew + peach — now uses light glyphs on the orange badge', async () => {
  const { registered, overrides } = await probe('coldbrew', 'peach')
  const theme = registered.find((item) => item.id === 'catppuccin-coldbrew')
  const override = overrides.find((item) => item.id === 'catppuccin-x-accent')
  assert.equal(override.patch['--dsw-alias-brand-primary'].light, '#fe640b')
  assert.equal(override.patch['--dsw-alias-label-primary-foreground'].light, '#ffffff')

  // 品牌徽章字形由 client.js 的静态 CSS 指向 label-primary-foreground。
  const bundle = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')
  assert.ok(bundle.includes('g[clip-path="url(#dsh-wordmark-badge-clip)"] path{fill:var(--dsw-alias-label-primary-foreground)}'))
  assert.equal(theme.tokens['--dsw-alias-label-primary'], '#3d4a63')

  // 浅粉底仍判给深字：阈值不能把 pink 一起翻成白字。
  const pink = await probe('coldbrew', 'pink')
  const pinkOverride = pink.overrides.find((item) => item.id === 'catppuccin-x-accent')
  assert.equal(pinkOverride.patch['--dsw-alias-label-primary-foreground'].light, '#3d4a63')
})

test('running text shimmer is a three-colour primary gradient flowing across the whole text', async () => {
  const bundle = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')
  // 结构：新版 TextShimmer 的 content 是 root 的第一个 span，decoration 用 [inert] 隐藏。
  assert.ok(bundle.includes('[data-shimmer] > span:first-child'), 'content span must be the gradient target')
  assert.ok(bundle.includes('[data-shimmer] [inert]{display:none}'), 'native sweep copy must be hidden')
  assert.ok(bundle.includes('var(--cppc-shimmer-1)'), 'gradient must use the palette variables')
  assert.ok(bundle.includes('-webkit-background-clip:text'), 'gradient must be clipped to the glyphs')
  assert.ok(bundle.includes('animation:cppc-text-flow 4s linear infinite'), 'gradient must flow')
  assert.equal(bundle.includes('[data-text-shimmer]'), false, 'the 0.1.7 selector is dead in 0.2.x and must be gone')

  const expected = {
    'coldbrew+peach': ['#1e66f5', '#fe640b', '#8839ef'],
    'coldbrew+mauve': ['#1e66f5', '#8839ef', '#fe640b'],
    'coldbrew+blue': ['#1e66f5', '#8839ef', '#fe640b'],
    'mocha+peach': ['#89b4fa', '#fab387', '#cba6f7'],
    'mocha+mauve': ['#89b4fa', '#cba6f7', '#fab387']
  }
  for (const [key, colors] of Object.entries(expected)) {
    const [flavor, accent] = key.split('+')
    const { registered, overrides } = await probe(flavor, accent)
    const theme = registered.find((item) => item.id === 'catppuccin-' + flavor)
    const override = overrides.find((item) => item.id === 'catppuccin-x-accent')
    const actual = [1, 2, 3].map((index) => override === undefined
      ? theme.tokens['--cppc-shimmer-' + index]
      : override.patch['--cppc-shimmer-' + index].light)
    assert.deepEqual(actual, colors, key)
    assert.equal(new Set(actual).size, 3, 'three distinct colours expected for ' + key)
  }
})

test('settings page no longer renders font inputs', async () => {
  const definition = await loadBundle()
  let page = null
  const react = {
    createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }),
    useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
    useEffect: () => {},
    useRef: () => ({ current: null }),
    Fragment: Symbol('Fragment')
  }
  const ctx = {
    effect: (callback) => { const dispose = callback(); return () => { if (typeof dispose === 'function') dispose() } },
    on: () => () => {},
    timeout: () => () => {},
    get: () => undefined,
    remote: undefined,
    slots: {
      inject: (_name, register) => register(),
      register: (_options, component) => { page = component; return () => {} }
    },
    theme: {
      register: () => () => {},
      overrideTokens: () => () => {},
      getTheme: () => ({ preference: 'mocha' }),
      setTheme: () => {}
    }
  }
  await withFakeDom(() => definition.factory(() => react).apply(ctx))
  assert.equal(typeof page, 'function', 'the settings section must still register')

  const seen = []
  const walk = (node) => {
    if (node === null || node === undefined || typeof node !== 'object') return
    if (Array.isArray(node)) { node.forEach(walk); return }
    if (typeof node.type === 'function') { walk(node.type(node.props)); return }
    seen.push(node.type)
    walk(node.children)
    if (node.props.children !== undefined) walk(node.props.children)
  }
  walk(page())
  assert.equal(seen.includes('input'), false, 'font inputs must be gone')
  assert.ok(seen.includes('button'), 'theme / accent pickers stay')
})

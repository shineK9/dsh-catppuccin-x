/**
 * 客户端 bundle 的**样式归属契约**。
 *
 * 这一组防的是一次真实的坏法：`<style>` 标签没有 `data-plugin`，于是被宿主的
 * claimStyles() 认领给「恰好此刻物化的那个插件」，那个插件一换版就把它删掉 ——
 * 表现是「插件重载 / 换个插件重载，本插件的样式就没了，只能刷新页面」。
 *
 * 判据只依赖 bundle 自己：插在哪一步（模块作用域 vs apply）、打没打归属、换版后
 * 会不会重新插入。宿主那一侧的规则见 dsh-client-modules 的 claimStyles /
 * removeOwnedStyles 与 replace() 的时序。
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const OWNER = 'dsh-catppuccin-x'
const STATIC_TAG = 'dsh-catppuccin-x/style.css'

/** 加载 lib/client.js（浏览器 bundle，不是 ESM）并取出它注册的 factory。 */
async function loadBundle() {
  const source = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')
  let definition = null
  new Function('window', source)({ __ModuleLoader__: { load: (value) => { definition = value } } })
  assert.notEqual(definition, null, 'the bundle must call window.__ModuleLoader__.load')
  return definition
}

/** 只回答 react 的 require；任何其它模块请求都是缺陷。 */
const requireStub = (request) => {
  if (request === 'react') {
    return {
      createElement: () => null,
      useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
      useEffect: () => {},
      useRef: () => ({ current: null }),
      Fragment: Symbol('Fragment')
    }
  }
  throw new Error('unexpected module request: ' + request)
}

/**
 * 假 DOM：只实现宿主认领 / 回收样式用到的那几样 —— `createElement('style')`、
 * `head.append`、属性选择器，以及 claimStyles / removeOwnedStyles 的判据。
 */
function fakeStyleDom() {
  const head = { children: [] }
  const attributeSelector = /^style\[([a-z-]+)="([^"]*)"\]$/
  const element = () => {
    const attributes = {}
    const tag = {
      tagName: 'style',
      textContent: '',
      getAttribute: (name) => (name in attributes ? attributes[name] : null),
      setAttribute: (name, value) => {
        attributes[name] = String(value)
      },
      remove: () => {
        const index = head.children.indexOf(tag)
        if (index >= 0) head.children.splice(index, 1)
      }
    }
    return tag
  }
  const document = {
    head: { append: (tag) => head.children.push(tag) },
    createElement: element,
    querySelector: (selector) => {
      // 宿主 claimStyles() 只碰「未打标」的标签。
      if (selector === 'style:not([data-plugin])') {
        return head.children.find((tag) => tag.getAttribute('data-plugin') === null) ?? null
      }
      const match = attributeSelector.exec(selector)
      if (match === null) throw new Error('fakeStyleDom: unsupported selector ' + selector)
      return head.children.find((tag) => tag.getAttribute(match[1]) === match[2]) ?? null
    }
  }
  return {
    document,
    tags: () => head.children.slice(),
    /** claimStyles() 会把这些标签认领给「恰好此刻物化」的那个插件。 */
    unowned: () => head.children.filter((tag) => tag.getAttribute('data-plugin') === null),
    /** 宿主的 removeOwnedStyles(id)：换版前先删掉上一版留下的标签。 */
    removeOwned: (id) => {
      for (const tag of head.children.filter((item) => item.getAttribute('data-plugin') === id)) tag.remove()
    },
    dynamic: () => head.children.filter((tag) => String(tag.getAttribute('data-plugin-css')).includes('/dynamic-'))
  }
}

/** 装上假 document 跑一段，跑完把全局还原。 */
async function withStyleDom(run) {
  const original = globalThis.document
  const dom = fakeStyleDom()
  globalThis.document = dom.document
  try {
    await run(dom)
  } finally {
    if (original === undefined) delete globalThis.document
    else globalThis.document = original
  }
}

test('the settings sheet is inserted while the bundle materializes, owned by this plugin', async () => {
  const definition = await loadBundle()
  assert.equal(definition.id, OWNER)

  await withStyleDom(async (dom) => {
    // 冷启动：宿主先建行、再物化 bundle，最后才挂 fiber（apply 在这之后）。
    definition.factory(requireStub)
    assert.equal(dom.tags().length, 1, 'materialization itself must insert the sheet')

    const tag = dom.tags()[0]
    assert.equal(tag.getAttribute('data-plugin'), OWNER, 'the sheet must name its owner')
    assert.equal(tag.getAttribute('data-plugin-css'), STATIC_TAG)
    assert.ok(tag.textContent.includes('.cppc-page'), 'the real settings CSS must be in the tag')
    assert.equal(dom.unowned().length, 0, 'an untagged sheet would be claimed by whichever plugin materializes next')

    // 换版：宿主先 removeOwnedStyles(id) 再物化新 bundle ⇒ 样式必须重新插入。
    dom.removeOwned(OWNER)
    assert.equal(dom.tags().length, 0)
    definition.factory(requireStub)
    assert.equal(dom.tags().length, 1, 'a bundle reload must re-insert the sheet')

    // 同一页里重复物化（判重命中）只留一份。
    definition.factory(requireStub)
    assert.equal(dom.tags().length, 1, 'a duplicate materialization must not stack a second sheet')
  })
})

test('the sheet is inserted at module scope, never from apply', async () => {
  const bundle = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')
  const at = bundle.indexOf("style.setAttribute('data-plugin-css', CSS_TAG)")
  assert.ok(at > 0, 'the static sheet must still be inserted')
  assert.equal(bundle.indexOf("style.setAttribute('data-plugin-css', CSS_TAG)", at + 1), -1, 'only one insertion site')
  // 模块作用域 = 在 apply 之前执行；宿主换版的顺序是「先回收旧标签，再物化」。
  const applied = bundle.indexOf('async function apply(ctx)')
  assert.ok(applied > 0, 'the bundle must still define apply')
  assert.ok(at < applied, 'the insertion must run at materialization, before the plugin is applied')
})

test('dynamic sheets (fonts / sidebar / shimmer) carry the owner tag too', async () => {
  const definition = await loadBundle()
  await withStyleDom(async (dom) => {
    const plugin = definition.factory(requireStub)
    const disposers = []
    const ctx = {
      effect: (callback) => {
        const dispose = callback()
        if (typeof dispose === 'function') disposers.push(dispose)
        return () => {}
      },
      on: () => () => {},
      timeout: () => () => {},
      get: () => undefined,
      remote: undefined,
      slots: { inject: () => () => {}, register: () => () => {} },
      theme: {
        register: () => () => {},
        overrideTokens: () => () => {},
        getTheme: () => ({ preference: 'mocha' }),
        setTheme: () => {}
      }
    }
    await plugin.apply(ctx)
    const dynamic = dom.dynamic()
    assert.ok(dynamic.length >= 1, 'the shimmer highlight sheet is inserted at apply')
    for (const tag of dynamic) assert.equal(tag.getAttribute('data-plugin'), OWNER, 'a dynamic sheet left unowned gets stolen')
    assert.equal(dom.unowned().length, 0)

    // 插件自己那套清理仍然有效（与宿主回收是同一件事，幂等）。
    for (const dispose of disposers) dispose()
    assert.equal(dom.dynamic().length, 0, 'the plugin must still clean up after itself')
  })
})

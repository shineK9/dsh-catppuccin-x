/**
 * dsh-catppuccin-x 宿主半。
 *
 * 职责：
 *  1. 持久化个性化设置：新版 dsh 用 volatile Config + `ctx.settings.update`
 *     （0.1.7 起设置命名空间即 Loader 条目 id），旧版 dsh 沿用
 *     `ctx.settings.register` + 具名命名空间（0.1.6 及以前）；
 *  2. 提供 `catppuccinTheme` 服务（typertRemote 绑定，配合 ./typert 清单
 *     走 Typert 网关），客户端经 `ctx.get('remote.catppuccinTheme')`
 *     调用 load/save —— 宿主侧直写设置文档，不经 api-proxy 的
 *     配置客户端暴露白名单。
 *  3. 经 webServer.tapIndex 在每次 index.html 响应中注入 Catppuccin
 *     首屏 loading 页（内联 logo.svg + 呼吸点 + 自愈脚本），
 *     logo 缺失时安全降级为默认 loading。
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import z from '@deepseek-ai/schemastery'
import { injectSplash } from './splash.js'

/** 稳定插件名（Loader 行 id 之外的包内标识）。 */
export const name = 'catppuccin-x'

/**
 * 旧版 dsh（0.1.6 及以前）的具名设置命名空间。当时的
 * `settingsNamespace()` 只做 kebab-case 校验后原样返回，这里直接写字面量，
 * 从而不必在新版运行时导入已被移除的 `@deepseek-ai/dsh-settings` 导出。
 */
const LEGACY_SETTINGS_NS = 'dsh-catppuccin-x'

/** logo.svg 绝对路径（包根目录，index.js 的上一级）；导出供回归测试断言。 */
export const LOGO_PATH = fileURLToPath(new URL('../logo.svg', import.meta.url))

/** 默认值保证快照始终完整。 */
const DEFAULTS = {
  flavor: 'mocha',
  accent: 'mauve',
  uiFont: '',
  codeFont: '',
  appliedUi: '',
  appliedCode: ''
}

/**
 * 新版 dsh 的 Config：每个字段标记 volatile，设置页因此可逐字段读写，
 * 且写入只更新运行中的引用而不重挂插件。
 *
 * 旧版 schemastery（0.1.5 运行的 3.18.2）没有 `.volatile()`，因此按运行时
 * 能力逐字段降级 —— 旧版走 register 路径，Config 只作元数据。
 */
function volatileField(schema) {
  return typeof schema.volatile === 'function' ? schema.volatile() : schema
}

export const Config = z.object({
  flavor: volatileField(z.string().default(DEFAULTS.flavor)),
  accent: volatileField(z.string().default(DEFAULTS.accent)),
  uiFont: volatileField(z.string().default(DEFAULTS.uiFont)),
  codeFont: volatileField(z.string().default(DEFAULTS.codeFont)),
  appliedUi: volatileField(z.string().default(DEFAULTS.appliedUi)),
  appliedCode: volatileField(z.string().default(DEFAULTS.appliedCode))
})

const SETTINGS_KEYS = Object.keys(DEFAULTS)

/** 读取一个字段：新版是 volatile 引用（.get()），旧版是普通值。 */
function readField(source, key) {
  if (source === undefined || source === null) return DEFAULTS[key]
  const field = source[key]
  if (field === null || field === undefined) return DEFAULTS[key]
  if (typeof field === 'object' && typeof field.get === 'function') return field.get()
  return field
}

/** 把任意来源投影成完整设置快照（缺字段回退默认值）。 */
function snapshot(source) {
  const out = {}
  for (const key of SETTINGS_KEYS) out[key] = readField(source, key)
  return out
}

/**
 * 根据运行时能力选择持久化后端。
 *
 * 新版（0.1.7+）：命名空间就是 Loader 条目 id，写入走 `settings.update`，
 * 由 configEditor 落到 profile 的 patch 层，volatile 字段热更新。
 * 旧版（≤0.1.6）：注册一个 schema 命名空间，读写 `settings.get/update`。
 */
function createBackend(ctx, config) {
  const settings = ctx.settings
  if (settings === undefined || settings === null) return undefined
  const newApi = typeof settings.register !== 'function' && typeof settings.describe === 'function'
  if (newApi) {
    const namespace = String(ctx.fiber?.entry?.options?.id ?? 'catppuccin-x')
    return {
      /** 当前运行中的设置。 */
      read: () => snapshot(config),
      /** 合并补丁并持久化，返回更新后的完整设置。 */
      async write(patch) {
        await settings.update(namespace, patch)
        return snapshot(config)
      }
    }
  }
  if (typeof settings.register !== 'function') return undefined
  const disposer = settings.register(LEGACY_SETTINGS_NS, Config)
  if (typeof disposer === 'function') ctx.effect(() => disposer, 'catppuccin-x: settings namespace')
  return {
    read: () => snapshot(settings.get(LEGACY_SETTINGS_NS)),
    async write(patch) {
      const next = { ...snapshot(settings.get(LEGACY_SETTINGS_NS)) }
      for (const key of Object.keys(patch)) next[key] = patch[key]
      await settings.update(LEGACY_SETTINGS_NS, next)
      return snapshot(settings.get(LEGACY_SETTINGS_NS))
    }
  }
}

/**
 * 创建 catppuccinTheme 服务对象。手写 `typertRemote` 绑定
 * （service/serviceKey/namespace），与 ./typert.host.js 清单一致。
 */
function createService(backend) {
  const service = {
    /** 读取当前完整设置。 */
    load() {
      return { ...backend.read() }
    },
    /** 合并一份补丁并持久化，返回更新后的完整设置。 */
    async save(patch) {
      if (patch === null || typeof patch !== 'object' || Array.isArray(patch)) return { ...backend.read() }
      const next = {}
      for (const key of Object.keys(patch)) {
        if (SETTINGS_KEYS.includes(key)) next[key] = patch[key]
      }
      return { ...(await backend.write(next)) }
    }
  }
  Object.defineProperty(service, 'typertRemote', {
    value: { service, serviceKey: 'catppuccinTheme', namespace: 'catppuccinTheme' }
  })
  return service
}

/**
 * 挂载设置后端与 RPC 服务；同时注册首屏 splash 注入。
 * settings 服务由宿主进程提供（可选依赖，缺失时静默跳过——Web 环境始终存在）。
 */
export function apply(ctx, config) {
  ctx.inject(['settings'], (settingsCtx) => {
    const backend = createBackend(settingsCtx, config)
    if (backend === undefined) return
    settingsCtx.provide('catppuccinTheme', createService(backend))
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
      const legacySection = settings !== undefined && typeof settings.get === 'function'
        ? settings.get(LEGACY_SETTINGS_NS)
        : undefined
      const section = snapshot(legacySection ?? config)
      return injectSplash(html, section.flavor, logoSvg)
    }), 'catppuccin-x: boot splash')
  })
}

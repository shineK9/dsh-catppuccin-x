/**
 * dsh-catppuccin-x 宿主半。
 *
 * 职责：
 *  1. 向 Host 设置文档注册 `dsh-catppuccin-x` 命名空间；
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
import { fileURLToPath } from 'node:url'
import z from '@deepseek-ai/schemastery'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import { injectSplash } from './splash.js'

/** 稳定插件名（Loader 行 id 之外的包内标识）。 */
export const name = 'catppuccin-x'

/** 与浏览器端 SETTINGS_NS 对应的设置命名空间。 */
const SETTINGS_NS = settingsNamespace('dsh-catppuccin-x')

/** logo.svg 绝对路径（包根目录，index.js 的上一级）；导出供回归测试断言。 */
export const LOGO_PATH = fileURLToPath(new URL('../logo.svg', import.meta.url))

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
    }), 'catppuccin-x: boot splash')
  })
}

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
 */

import z from '@deepseek-ai/schemastery'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'

/** 稳定插件名（Loader 行 id 之外的包内标识）。 */
export const name = 'catppuccin-theme'

/** 与浏览器端 SETTINGS_NS 对应的设置命名空间。 */
const SETTINGS_NS = settingsNamespace('dsh-catppuccin-theme')

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
 * 注册设置命名空间并挂载 RPC 服务。settings 服务由宿主进程提供
 * （可选依赖，缺失时静默跳过——Web 环境始终存在）。
 */
export function apply(ctx) {
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.register(SETTINGS_NS, PersoSettingsSchema)
    settingsCtx.provide('catppuccinTheme', createService(settingsCtx))
  })
}

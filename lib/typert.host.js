/**
 * dsh-catppuccin-x 的 Host 面 Typert 清单（由 typert-loader 自动扫描注册）。
 * 手写清单，结构与 @deepseek-ai/dsh-typert-generator 产物一致：
 * `./typert` 导出 TYPERT，invocations 的 codec 必须是 zod v4 实例。
 *
 * 暴露两个 RPC：load / save。客户端经 `ctx.get('remote.catppuccinTheme')`
 * 调用；宿主直写 settings 文档（不经 api-proxy 的暴露白名单）。
 */

import { z } from 'zod'

const settingsSchema = z.object({
  flavor: z.string(),
  accent: z.string(),
  uiFont: z.string(),
  codeFont: z.string(),
  appliedUi: z.string(),
  appliedCode: z.string()
})

const patchSchema = z.record(z.string(), z.unknown())

const _settings$codec = { mode: 'strict', typeSymbol: 'dsh-catppuccin-x#PersoSettings', schema: settingsSchema }
const _patch$codec = { mode: 'strict', typeSymbol: 'dsh-catppuccin-x#PersoPatch', schema: patchSchema }

export const TYPERT = {
  package: 'dsh-catppuccin-x',
  face: 'host',
  schemas: [],
  invocations: [
    {
      id: 'dsh-catppuccin-x#catppuccinTheme/load',
      service: 'catppuccinTheme',
      namespace: 'catppuccinTheme',
      method: 'load',
      invocation: { kind: 'direct' },
      parameters: [],
      result: _settings$codec
    },
    {
      id: 'dsh-catppuccin-x#catppuccinTheme/save',
      service: 'catppuccinTheme',
      namespace: 'catppuccinTheme',
      method: 'save',
      invocation: { kind: 'direct' },
      parameters: [
        { name: 'patch', wire: 'patch', source: 'json', codec: _patch$codec }
      ],
      result: _settings$codec
    }
  ],
  model: {
    services: [
      {
        description: 'Catppuccin 个性化设置服务(ctx.catppuccinTheme)，读写持久化的主题与字体设置。',
        summary: 'Catppuccin 个性化设置服务。',
        tags: [],
        jsDoc: '/** Catppuccin 个性化设置服务(ctx.catppuccinTheme)。 */',
        key: 'catppuccinTheme',
        exportName: 'CatppuccinThemeService',
        members: [
          {
            kind: 'method',
            name: 'load',
            signature: 'load(): PersoSettings',
            summary: '读取持久化的个性化设置。',
            jsDoc: '/**\n * 读取持久化的个性化设置。\n * @returns 完整设置对象。\n */'
          },
          {
            kind: 'method',
            name: 'save',
            signature: 'save(patch: PersoPatch): PersoSettings',
            summary: '合并一份设置补丁并持久化。',
            jsDoc: '/**\n * 合并一份设置补丁并持久化。\n * @param patch - 设置补丁。\n * @returns 更新后的完整设置。\n */'
          }
        ],
        types: []
      }
    ],
    events: [],
    objects: []
  }
}

export default TYPERT

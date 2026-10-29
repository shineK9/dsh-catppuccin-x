/**
 * dsh-catppuccin-x 浏览器端 bundle（单文件，经 __ModuleLoader__ 加载）。
 *
 * 提供设置页「Catppuccin」：
 *  - 主题：Catppuccin flavor（Latte / Coldbrew / Frappé / Macchiato / Mocha），
 *    通过 theme.register 注册为可选主题；Coldbrew 是本插件自造的浅色 flavor
 *    （基于 Latte 改造：近白冷调底 + 冷蓝灰 veil，去掉中性灰的“脏”感）；
 *  - 强调色：mauve / blue / green / peach / red / pink，theme.overrideTokens 叠加；
 *  - 执行中文字流光：TextShimmer（步骤标题 / 运行状态 / 工具行等）的整段文字改为
 *    「蓝 ↔ 强调色 ↔ 紫」三色主色渐变，4s 线性循环流动；
 *  - 设置经 Typert RPC（remote.catppuccinTheme load/save）持久化到 Host
 *    设置文档，刷新/重启后自动恢复（settingsScope 通道受 api-proxy 暴露
 *    白名单限制，本插件命名空间不在白名单内，故走宿主直写）。
 *
 * 字体不在本插件职责内：DSH 原生外观设置已支持界面 / 代码字体自定义，
 * 插件再注入 :root 字体变量只会与宿主设置互相覆盖，故整体移除。
 *
 * 样式全部使用 --dsw-* 主题变量，跟随当前主题。
 */

window.__ModuleLoader__.load({
  id: 'dsh-catppuccin-x',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    const React = require('react')

    // ── Catppuccin 官方调色板（palette.json 提取） ────────────────────────
    // coldbrew 为自造浅色 flavor：官方 Latte 的色相被换成冷蓝调，底/层全部提亮
    // （base 近白、mantle 冰蓝），中性灰 surface 收进冷蓝灰；veil 是浅色模式下
    // 边框 / chip / 代码底的半透明色源（官方 flavor 无此键时退回 label-primary）。

    const PALETTE = {
      latte: { base: '#f6f7f9', mantle: '#eef0f4', crust: '#e5e8ee', surface0: '#dfe2e9', surface1: '#d3d7df', surface2: '#c6cbd5', text: '#4c4f69', subtext1: '#5c5f77', subtext0: '#6c6f85', overlay0: '#9ca0b0', mauve: '#8839ef', blue: '#1e66f5', green: '#40a02b', peach: '#fe640b', red: '#d20f39', pink: '#ea76cb', yellow: '#df8e1d' },
      coldbrew: { base: '#fbfcfe', mantle: '#f1f6fc', crust: '#e7eef8', surface0: '#dde6f2', surface1: '#cbd7e8', surface2: '#b5c4da', text: '#3d4a63', subtext1: '#55617c', subtext0: '#667390', overlay0: '#96a1b6', veil: '#5b76a8', mauve: '#8839ef', blue: '#1e66f5', green: '#40a02b', peach: '#fe640b', red: '#d20f39', pink: '#ea76cb', yellow: '#df8e1d' },
      frappe: { base: '#303446', mantle: '#292c3c', crust: '#232634', surface0: '#414559', surface1: '#51576d', surface2: '#626880', text: '#c6d0f5', subtext1: '#b5bfe2', subtext0: '#a5adce', overlay0: '#737994', mauve: '#ca9ee6', blue: '#8caaee', green: '#a6d189', peach: '#ef9f76', red: '#e78284', pink: '#f4b8e4', yellow: '#e5c890' },
      macchiato: { base: '#24273a', mantle: '#1e2030', crust: '#181926', surface0: '#363a4f', surface1: '#494d64', surface2: '#5b6078', text: '#cad3f5', subtext1: '#b8c0e0', subtext0: '#a5adcb', overlay0: '#6e738d', mauve: '#c6a0f6', blue: '#8aadf4', green: '#a6da95', peach: '#f5a97f', red: '#ed8796', pink: '#f5bde6', yellow: '#eed49f' },
      mocha: { base: '#1e1e2e', mantle: '#181825', crust: '#11111b', surface0: '#313244', surface1: '#45475a', surface2: '#585b70', text: '#cdd6f4', subtext1: '#bac2de', subtext0: '#a6adc8', overlay0: '#6c7086', mauve: '#cba6f7', blue: '#89b4fa', green: '#a6e3a1', peach: '#fab387', red: '#f38ba8', pink: '#f5c2e7', yellow: '#f9e2af' }
    }
    const FLAVORS = [
      { id: 'latte', scheme: 'light', label: 'Latte' },
      { id: 'coldbrew', scheme: 'light', label: 'Coldbrew' },
      { id: 'frappe', scheme: 'dark', label: 'Frappé' },
      { id: 'macchiato', scheme: 'dark', label: 'Macchiato' },
      { id: 'mocha', scheme: 'dark', label: 'Mocha' }
    ]
    /**
     * 走浅色分支的 flavor（raised 取 base、边框/chip 用半透明色源、强调色上叠白字）。
     * 新浅色 flavor 只需在这里登记，buildTokens / syncAccent 自动跟随。
     */
    const LIGHT_FLAVORS = new Set(['latte', 'coldbrew'])
    const ACCENTS = [
      { id: 'mauve', label: '淡紫' },
      { id: 'blue', label: '蓝' },
      { id: 'green', label: '绿' },
      { id: 'peach', label: '蜜桃' },
      { id: 'red', label: '红' },
      { id: 'pink', label: '粉' }
    ]
    // ── 有色底上的前景色阈值 ──────────────────────────────────────────────
    //
    // 品牌徽章 / 主按钮的文字压在强调色上时，前景色不能按 flavor 明暗一刀切：
    // 浅色 flavor 的 peach（#fe640b）上白字 2.98:1、深字（coldbrew text
    // #3d4a63）2.99:1，几乎打平；pink（#ea76cb）上白字 2.64:1、深字 3.04:1，
    // 深字才明显更清楚。实现按 WCAG 相对亮度分别算两者与底色的对比度，只在深字
    // 超出 0.1 判据时才切深字 —— 交叉点附近（peach 这类橙底）保留浅色字，视觉上
    // 更像品牌徽章；新强调色 / 新 flavor 不用再逐个登记深浅分支。
    function channelToLinear(channel) {
      const c = channel / 255
      return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
    }
    function luminance(hex) {
      const n = parseInt(hex.slice(1), 16)
      return 0.2126 * channelToLinear((n >> 16) & 0xff)
        + 0.7152 * channelToLinear((n >> 8) & 0xff)
        + 0.0722 * channelToLinear(n & 0xff)
    }
    /** WCAG 2.x 对比度（1:1 ~ 21:1）。 */
    function contrastRatio(a, b) {
      const x = luminance(a)
      const y = luminance(b)
      return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
    }
    /** 深字要启用时必须比白字高出的对比度点数（见 onColor）。 */
    const ON_COLOR_MARGIN = 0.1
    /**
     * 在有色底上选前景：浅色字（#fff）与深色字（浅色 flavor 取 text、深色 flavor
     * 取 base）二选一。深字必须比白字高出 0.1 个对比度点才启用，否则用浅色字 ——
     * peach 橙底是平手（取浅色字），pink 浅粉底深字明显更清楚（取深色字）。
     * 深色 flavor 的粉彩强调色同理全部落在深字一侧。
     */
    function onColor(bg, c, light) {
      const ink = light ? c.text : c.base
      const white = contrastRatio(bg, '#ffffff')
      const dark = contrastRatio(bg, ink)
      return dark > white + ON_COLOR_MARGIN ? ink : '#ffffff'
    }

    /**
     * 执行中文字流光的三色（蓝 ↔ 强调色 ↔ 紫）：蓝与紫固定，中间色跟随用户选的
     * 强调色；强调色本身就是蓝/紫时往后补 peach，保证三色互不相同。返回顺序即
     * 渐变 stop 顺序，浅色 / 深色 flavor 各用自己调色板的值。
     */
    function shimmerColors(f, accentId) {
      const c = PALETTE[f]
      const picked = []
      const candidates = [c.blue, accentId === 'mauve' ? c.mauve : c[accentId], c.mauve, c.peach]
      for (const color of candidates) {
        if (typeof color === 'string' && !picked.includes(color)) picked.push(color)
      }
      return picked.slice(0, 3)
    }

    /** 设置值：内存镜像（Host 设置文档持久化，刷新/重启后由 apply 恢复）。 */
    const store = { flavor: 'mocha', accent: 'mauve' }

    // ── DSW alias token -> Catppuccin 色（对齐默认主题的明度层级） ────────

    function buildTokens(f) {
      const c = PALETTE[f]
      const light = LIGHT_FLAVORS.has(f)
      const raised = light ? c.base : c.surface0
      const raisedHover = light ? c.mantle : c.surface1
      const onBrand = onColor(c.mauve, c, light)
      const shimmer = shimmerColors(f, 'mauve')
      const brandHover = light
        ? 'color-mix(in srgb, var(--dsw-alias-brand-primary) 85%, black)'
        : 'color-mix(in srgb, var(--dsw-alias-brand-primary) 85%, white)'
      const mix = (name, pct) => 'color-mix(in srgb, var(' + name + ') ' + pct + '%, transparent)'
      // 浅色模式：实色 surface 会显得灰重，边框/chip/代码底统一改半透明色源。
      // flavor 自带 veil（coldbrew 的冷蓝灰 #5b76a8）时用它，混出来的底纹是冷调
      // 而不是中性灰 —— 灰底叠灰字正是 Latte 显得“脏”的来源。
      const soft = (pct) => c.veil === undefined
        ? mix('--dsw-alias-label-primary', pct)
        : 'color-mix(in srgb, ' + c.veil + ' ' + pct + '%, transparent)'
      const softOr = (pct, fallback) => light ? soft(pct) : fallback
      return {
        // 背景 / 层次
        '--dsw-alias-bg-base': c.base,
        '--dsw-alias-bg-layer-1': c.mantle,
        '--dsw-alias-bg-layer-2': c.crust,
        '--dsw-alias-bg-layer-3': light ? c.base : c.surface0,
        '--dsw-alias-bg-overlay': c.surface0,
        '--dsw-alias-bg-module-platform': softOr('6', c.surface0),
        '--dsw-alias-bg-multi-select': softOr('6', c.surface0),
        '--dsw-alias-bg-skeleton': mix('--dsw-alias-label-primary', '5'),
        // 边框
        '--dsw-alias-border-inverted': softOr('6', c.surface0),
        '--dsw-alias-border-inverted2': softOr('6', c.surface0),
        '--dsw-alias-border-l1': softOr('6', c.surface0),
        '--dsw-alias-border-l2-darkmode-thin': softOr('8', c.surface0),
        '--dsw-alias-border-l2': softOr('10', c.surface1),
        '--dsw-alias-border-l3': softOr('14', c.surface2),
        '--dsw-alias-border-l4': softOr('18', c.surface2),
        // 品牌
        '--dsw-alias-brand-primary': c.mauve,
        '--dsw-alias-brand-primary-invert': c.text,
        '--dsw-alias-brand-primary-new-colorprimary-new-color': c.mauve,
        '--dsw-alias-brand-text': c.text,
        '--primary': c.mauve,
        '--primary-color': c.mauve,
        // deepseek 官方品牌色阶 → 强调色（组件里硬编码的官方蓝，如 turn-status
        // 渐变文字，经这些静态变量被我们的色阶接管）
        '--dsw-static-deepseek-50': 'color-mix(in srgb, var(--dsw-alias-brand-primary) 12%, white)',
        '--dsw-static-deepseek-100': 'color-mix(in srgb, var(--dsw-alias-brand-primary) 25%, white)',
        '--dsw-static-deepseek-200': 'color-mix(in srgb, var(--dsw-alias-brand-primary) 45%, white)',
        '--dsw-static-deepseek-400': 'color-mix(in srgb, var(--dsw-alias-brand-primary) 80%, white)',
        '--dsw-static-deepseek-450': 'color-mix(in srgb, var(--dsw-alias-brand-primary) 90%, white)',
        '--dsw-static-deepseek-500': 'var(--dsw-alias-brand-primary)',
        '--dsw-static-deepseek-750': 'color-mix(in srgb, var(--dsw-alias-brand-primary) 65%, black)',
        '--dsw-static-deepseek-800': 'color-mix(in srgb, var(--dsw-alias-brand-primary) 55%, black)',
        // 执行中文字流光的三色（强调色层会覆盖成当前强调色，见 syncAccent）
        '--cppc-shimmer-1': shimmer[0],
        '--cppc-shimmer-2': shimmer[1],
        '--cppc-shimmer-3': shimmer[2],
        // 文字
        '--dsw-alias-label-primary': c.text,
        '--dsw-alias-label-primary-bluish': c.text,
        '--dsw-alias-label-primary-dimmed': mix('--dsw-alias-label-primary', '60'),
        '--dsw-alias-label-primary-foreground': onBrand,
        '--dsw-alias-label-primary-inverted': light ? '#ffffff' : c.text,
        '--dsw-alias-label-secondary': c.subtext1,
        '--dsw-alias-label-tertiary': c.subtext0,
        '--dsw-alias-label-caption': c.overlay0,
        '--dsw-alias-label-dimmed': c.overlay0,
        // 按钮
        '--dsw-alias-button-contrast-fill': c.text,
        '--dsw-alias-button-elevated-fill': raised,
        '--dsw-alias-button-floating-fill': raised,
        '--dsw-alias-button-floating-hover': raisedHover,
        '--dsw-alias-button-ghost-active-border': softOr('16', c.surface2),
        '--dsw-alias-button-ghost-active-fill': softOr('8', c.surface0),
        '--dsw-alias-button-ghost-active-hover': softOr('12', c.surface1),
        '--dsw-alias-button-info-fill': c.mauve,
        '--dsw-alias-button-info-hover': c.mauve,
        '--dsw-alias-button-primary-dimmed': mix('--dsw-alias-brand-primary', '14'),
        '--dsw-alias-button-primary-fill': c.mauve,
        '--dsw-alias-button-primary-hover': brandHover,
        '--dsw-alias-button-tool-bar-fill-invisible': mix('--dsw-alias-label-primary', '26'),
        '--dsw-alias-button-tool-bar-fill': mix('--dsw-alias-label-primary', '40'),
        '--dsw-alias-button-tool-bar-hover': mix('--dsw-alias-label-primary', '48'),
        // 交互
        '--dsw-alias-interactive-bg-active': mix('--dsw-alias-label-primary', '14'),
        '--dsw-alias-interactive-bg-hover': mix('--dsw-alias-label-primary', '8'),
        '--dsw-alias-interactive-bg-hover-accent': mix('--dsw-alias-brand-primary', '18'),
        '--dsw-alias-interactive-bg-hover-danger': mix('--dsw-alias-state-error-primary', '8'),
        '--dsw-alias-interactive-bg-hover-solid': mix('--dsw-alias-label-primary', '12'),
        // 状态
        '--dsw-alias-state-error-primary': c.red,
        '--dsw-alias-state-error-secondary': c.red,
        '--dsw-alias-state-success-primary': c.green,
        '--dsw-alias-state-success-secondary': c.green,
        '--dsw-alias-state-success-tertiary': mix('--dsw-alias-state-success-primary', '15'),
        '--dsw-alias-state-warn-primary': c.yellow,
        '--dsw-alias-state-warn-secondary': c.yellow,
        '--dsw-alias-state-warn-tertiary': mix('--dsw-alias-state-warn-primary', '15'),
        '--dsw-alias-state-business-primary': c.mauve,
        '--dsw-alias-state-business-tertiary': mix('--dsw-alias-state-business-primary', '15'),
        // 滚动条
        '--dsw-alias-scrollbar-bg-l1': softOr('18', c.surface1),
        '--dsw-alias-scrollbar-bg-l2': softOr('22', c.surface2),
        '--dsw-alias-scrollbar-hover-l1': softOr('22', c.surface2),
        '--dsw-alias-scrollbar-hover-l2': softOr('28', c.overlay0),
        // markdown
        '--dsw-alias-markdown-citation': softOr('5', c.surface1),
        '--dsw-alias-markdown-code-block': softOr('5', c.surface0),
        '--dsw-alias-markdown-code-block-banner': softOr('7', c.surface1),
        '--dsw-alias-markdown-code-segment-selected': softOr('8', c.surface1),
        '--dsw-alias-markdown-code-segment-unselected': softOr('5', c.surface0),
        '--dsw-alias-markdown-inline-code': softOr('8', c.surface1),
        '--dsw-alias-markdown-placeholder': softOr('4', c.surface0),
        '--dsw-alias-markdown-tag': softOr('6', c.surface0),
        // specific
        '--dsw-specific-bubble': softOr('5', c.surface0),
        '--dsw-specific-bubble-highlight': softOr('8', c.surface1),
        '--dsw-specific-input-major': raised,
        '--dsw-specific-login-input': softOr('6', c.surface0),
        '--dsw-specific-selector': softOr('6', c.surface0),
        '--dsw-specific-sidebar-fill': c.mantle,
        '--dsw-specific-sidebar-nav-item-active': softOr('10', c.surface1),
        '--dsw-specific-sidebar-nav-item-active-accent': mix('--dsw-alias-brand-primary', '14'),
        '--dsw-specific-sidebar-nav-item-hover': softOr('6', c.surface0),
        '--dsw-specific-tip': softOr('4', c.surface0)
      }
    }

    // ── 设置页样式 ─────────────────────────────────────────────────────────

    const CSS = [
      '.cppc-page{display:flex;flex-direction:column;gap:18px;padding:2px 0 24px;min-width:0}',
      '.cppc-sectionTitle{font-size:12px;font-weight:600;letter-spacing:.02em;color:var(--dsw-alias-label-secondary);margin-bottom:8px}',
      '.cppc-flavors{display:grid;grid-template-columns:repeat(auto-fill,minmax(136px,1fr));gap:8px}',
      '.cppc-flavor{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);border-radius:10px;padding:10px;cursor:pointer;text-align:left;font:inherit;color:var(--dsw-alias-label-primary)}',
      '.cppc-flavor:hover{background:var(--dsw-alias-interactive-bg-hover)}',
      '.cppc-flavor[data-active]{border-color:var(--dsw-alias-brand-primary);box-shadow:inset 0 0 0 1px var(--dsw-alias-brand-primary)}',
      '.cppc-swatches{display:flex;gap:4px;margin-bottom:8px}',
      '.cppc-swatch{width:14px;height:14px;border-radius:50%;border:1px solid var(--dsw-alias-border-l2)}',
      '.cppc-flavorName{font-size:12px;font-weight:600;line-height:16px}',
      '.cppc-flavorScheme{font-size:11px;color:var(--dsw-alias-label-tertiary);margin-top:2px}',
      '.cppc-accents{display:flex;gap:10px;align-items:center}',
      '.cppc-accent{width:22px;height:22px;border-radius:50%;cursor:pointer;border:2px solid transparent;padding:0}',
      '.cppc-accent:hover{transform:scale(1.12)}',
      '.cppc-accent[data-active]{border-color:var(--dsw-alias-label-primary)}',
      '.cppc-hint{font-size:11px;color:var(--dsw-alias-label-tertiary);margin-top:4px}',
      // 品牌字标「harness」徽章（BrandWordmark svg，viewBox 0 0 182 24）：
      // 背景 rect fill="currentColor"、字形 fill=var(--dsw-alias-label-primary-inverted)
      // 均为 presentation attribute 硬编码，CSS 规则优先级更高可安全覆盖。
      // 徽章底改用强调色，字形前景走 label-primary-foreground —— 该 token 由
      // onColor() 按 WCAG 对比度阈值在浅色字 / 深色字之间二选一（见同步层说明），
      // 于是橙底 peach 拿到浅色字，浅粉底 pink 仍拿深色字。
      'rect[x="129.348"]{fill:var(--dsw-alias-brand-primary)}',
      'g[clip-path="url(#dsh-wordmark-badge-clip)"] path{fill:var(--dsw-alias-label-primary-foreground)}'
    ].join('')
    const CSS_TAG = 'dsh-catppuccin-x/style.css'

    /**
     * 样式在**物化时**（模块作用域）插入，不在 apply 里 —— 这是宿主的回收时序定下的。
     *
     * dsh-client-modules 按 `data-plugin` 认领与回收 `<style>`：物化一个插件之后立刻
     * `claimStyles(id)` 把页面上所有**未打标**的标签记到它名下，换版时
     * `removeOwnedStyles(id)` 再按这个属性逐个删。于是：
     *   - 在 apply 里插入 ⇒ 插入发生在 claimStyles **之后**，标签始终无名，会被**下一个**
     *     物化的插件认领；那个插件一换版就把这份 CSS 删掉 —— 而本插件并没有换版，
     *     设置页样式就一直失踪到刷新页面（「插件重载样式全丢」的成因）；
     *   - 物化时插入 + 自己打上 `data-plugin` ⇒ 正好落在宿主「先回收旧标签、再物化新
     *     bundle」的窗口里，换版后自动重新插入，也不会被别的插件认领走。
     */
    if (typeof document !== 'undefined' && document.head !== null) {
      if (document.querySelector('style[data-plugin-css="' + CSS_TAG + '"]') === null) {
        const style = document.createElement('style')
        style.setAttribute('data-plugin', 'dsh-catppuccin-x')
        style.setAttribute('data-plugin-css', CSS_TAG)
        style.textContent = CSS
        document.head.append(style)
      }
    }

    // ── Typert RPC 贡献（与服务端 ./typert 清单一一对应） ──────────────────

    function fail(path, kind) {
      throw new TypeError('dsh-catppuccin-x: invalid ' + path + ', expected ' + kind)
    }
    function parseSettings(v, path) {
      if (v === null || typeof v !== 'object' || Array.isArray(v)) fail(path, 'object')
      return {
        flavor: typeof v.flavor === 'string' ? v.flavor : 'mocha',
        accent: typeof v.accent === 'string' ? v.accent : 'mauve'
      }
    }
    /**
     * 客户端侧的 codec 描述。
     *
     * 0.1.7 的 typert-registry 校验 `create` 必须是函数（服务端那份清单同理），
     * 少了它整条 RPC 贡献都注册不上 —— 表现是控制台一行
     * `remote mount failed … strict codec has no create() factory`，
     * 主题读写随之全部失效。这里保留 `parse`（旧客户端的取值方式）并补上 `create` 工厂，
     * 两代都认。
     */
    function codecOf(parse) {
      return { parse, create: () => ({ parse }) }
    }
    const settingsCodec = codecOf(parseSettings)
    const patchCodec = codecOf(parsePatch)
    function parsePatch(v) {
      if (v === null || typeof v !== 'object' || Array.isArray(v)) fail('patch', 'object')
      return v
    }

    const CONTRIBUTION = {
      package: 'dsh-catppuccin-x',
      descriptors: [
        {
          id: 'dsh-catppuccin-x#catppuccinTheme/load',
          service: 'catppuccinTheme',
          namespace: 'catppuccinTheme',
          method: 'load',
          invocation: { kind: 'direct' },
          parameters: [],
          result: { mode: 'strict', typeSymbol: 'dsh-catppuccin-x#PersoSettings', schema: settingsCodec, create: () => codecOf(parseSettings) }
        },
        {
          id: 'dsh-catppuccin-x#catppuccinTheme/save',
          service: 'catppuccinTheme',
          namespace: 'catppuccinTheme',
          method: 'save',
          invocation: { kind: 'direct' },
          parameters: [{ name: 'patch', wire: 'patch', source: 'json', codec: { mode: 'strict', typeSymbol: 'dsh-catppuccin-x#PersoPatch', schema: patchCodec, create: () => codecOf(parsePatch) } }],
          result: { mode: 'strict', typeSymbol: 'dsh-catppuccin-x#PersoSettings', schema: settingsCodec, create: () => codecOf(parseSettings) }
        }
      ]
    }

    // ── 插件体 ─────────────────────────────────────────────────────────────

    /** 需要的客户端服务（由客户端内核解析）。 */
    const inject = ['slots', 'theme', 'remote', 'timer']

    async function apply(ctx) {
      // 样式表已经由模块作用域插入（见 CSS 之后的说明）：在 apply 里插会插在宿主的
      // claimStyles 之后，标签无名、会被下一个物化的插件认领并删掉。

      // RPC 通道：挂载贡献并取得 catppuccinTheme 服务
      let themeApi = null
      const remote = ctx.remote
      if (remote !== undefined && typeof remote.$mount === 'function') {
        try {
          const unmount = await remote.$mount(CONTRIBUTION)
          ctx.effect(() => () => { unmount() }, 'catppuccin-x: remote contribution')
          themeApi = ctx.get('remote.catppuccinTheme')
        } catch (e) {
          console.log('catppuccin-x: remote mount failed', e && e.message || e)
        }
      }

      // 注册全部 flavor 主题（会出现在主题选择中）。
      // 当前 dsh 已内置同名 catppuccin 主题，重复注册会抛
      // "theme is already registered" 导致整个插件加载失败，
      // 故跳过已存在的 id（内置主题兜底，flavor 切换 id 一致不受影响）。
      // coldbrew 不是官方 flavor，必然注册成功，即便内置了四个官方 flavor 也仍在。
      const themeDisposers = []
      for (const f of FLAVORS) {
        try {
          themeDisposers.push(ctx.theme.register({
            id: 'catppuccin-' + f.id,
            colorScheme: f.scheme,
            tokens: buildTokens(f.id)
          }))
        } catch (error) {
          console.log('catppuccin-x: theme "catppuccin-' + f.id + '" already provided by built-ins, skipping')
        }
      }
      ctx.effect(() => () => { for (const d of themeDisposers) d() })

      // 强调色层（叠加在任意活动主题之上）
      let accentDisposer = () => {}
      function syncAccent(f, a) {
        accentDisposer()
        accentDisposer = () => {}
        if (a === 'mauve') return
        const accentColor = PALETTE[f][a]
        // 徽章 / 主按钮的字色：按对比度阈值二选一 —— 深字必须明显更清楚才启用，
        // 平手时保留浅色字，因此橙底 peach 不再被判成深字。
        const onAccent = onColor(accentColor, PALETTE[f], LIGHT_FLAVORS.has(f))
        const shimmer = shimmerColors(f, a)
        accentDisposer = ctx.theme.overrideTokens('catppuccin-x-accent', {
          '--dsw-alias-brand-primary': { light: accentColor, dark: accentColor },
          '--primary': { light: accentColor, dark: accentColor },
          '--primary-color': { light: accentColor, dark: accentColor },
          '--dsw-alias-brand-primary-new-colorprimary-new-color': { light: accentColor, dark: accentColor },
          '--dsw-alias-button-primary-fill': { light: accentColor, dark: accentColor },
          '--dsw-alias-button-info-fill': { light: accentColor, dark: accentColor },
          '--dsw-alias-button-info-hover': { light: accentColor, dark: accentColor },
          '--dsw-alias-state-business-primary': { light: accentColor, dark: accentColor },
          '--dsw-alias-label-primary-foreground': { light: onAccent, dark: onAccent },
          '--cppc-shimmer-1': { light: shimmer[0], dark: shimmer[0] },
          '--cppc-shimmer-2': { light: shimmer[1], dark: shimmer[1] },
          '--cppc-shimmer-3': { light: shimmer[2], dark: shimmer[2] }
        })
      }
      ctx.effect(() => () => accentDisposer())

      ctx.effect(() => () => disposeDesktopSidebar())

      // 执行中文字的三色流光（配色 / 选择器理由见 SHIMMER_CSS）
      const disposeShimmer = stylesInsert(SHIMMER_CSS)
      ctx.effect(() => () => disposeShimmer())

      // 持久化：启动时从 Host 设置文档恢复一次，之后每次交互写回
      let restored = false
      function applySaved(v) {
        if (typeof v.flavor === 'string' && v.flavor) store.flavor = v.flavor
        if (typeof v.accent === 'string' && v.accent) store.accent = v.accent
        syncAccent(store.flavor, store.accent)
        if (FLAVORS.some((f) => f.id === store.flavor)) {
          applyDesktopSidebar(store.flavor)
          ctx.theme.setTheme('catppuccin-' + store.flavor)
        }
        restored = true
      }
      if (themeApi !== null) {
        try {
          const response = await themeApi.load()
          if (response !== null && typeof response === 'object' && response.ok === true && response.value !== null && typeof response.value === 'object') {
            applySaved(response.value)
          }
        } catch (e) {
          console.log('catppuccin-x: load failed', e && e.message || e)
        }
      }

      // 对抗 ui-theme adopt() 的偏好覆盖：adopt() 会在页面加载时及任何
      // 设置文档失效（例如在对话框切换模型会写 agent-default-model 设置）
      // 后，把内存中的主题偏好异步重置回设置文档里的内置值
      // （system/light/dark），把本插件恢复阶段的 setTheme 踩掉。这里改为
      // 永久监听 theme/change：只要偏好被重置成内置值，就重新断言保存的
      // flavor；若偏好已经是某个 catppuccin-*（例如在 Appearance 里改选
      // 其他 flavor），则顺势采纳该 flavor。
      if (restored) {
        const ensureFlavor = () => {
          try {
            const pref = ctx.theme.getTheme().preference
            if (typeof pref === 'string' && pref.startsWith('catppuccin-')) {
              store.flavor = pref.slice(11)
              return
            }
            if (!FLAVORS.some((f) => f.id === store.flavor)) return
            const want = 'catppuccin-' + store.flavor
            if (pref !== want) ctx.theme.setTheme(want)
          } catch (e) {}
        }
        const offChange = ctx.on('theme/change', () => { ensureFlavor() })
        ctx.effect(() => () => offChange())
        // 启动初期 adopt() 可能异步把偏好重置，用几个定时器兜底抢占
        const t1 = ctx.timeout(() => ensureFlavor(), 1200)
        const t2 = ctx.timeout(() => ensureFlavor(), 3000)
        const t3 = ctx.timeout(() => ensureFlavor(), 6000)
        ctx.effect(() => () => { t1(); t2(); t3() })
        ensureFlavor()
      }

      const persist = () => {
        if (themeApi === null) return
        Promise.resolve(themeApi.save({
          flavor: store.flavor,
          accent: store.accent
        })).catch(() => {})
      }

      // ── 设置页 ───────────────────────────────────────────────────────────

      function PersonalizePage() {
        const [flavor, setFlavor] = React.useState(() => {
          const pref = ctx.theme.getTheme().preference
          if (typeof pref === 'string' && pref.startsWith('catppuccin-')) return pref.slice(11)
          return store.flavor
        })
        const [accent, setAccent] = React.useState(store.accent)

        React.useEffect(() => {
          return ctx.on('theme/change', () => {
            const pref = ctx.theme.getTheme().preference
            if (typeof pref === 'string' && pref.startsWith('catppuccin-')) {
              store.flavor = pref.slice(11)
              setFlavor(store.flavor)
            }
          })
        }, [])

        const pickFlavor = (f) => {
          store.flavor = f
          setFlavor(f)
          ctx.theme.setTheme('catppuccin-' + f)
          syncAccent(f, accent)
          applyDesktopSidebar(f)
          persist()
        }
        const pickAccent = (a) => {
          store.accent = a
          setAccent(a)
          syncAccent(flavor, a)
          persist()
        }

        return React.createElement('div', { className: 'cppc-page' },
          React.createElement('div', { className: 'cppc-sectionTitle' }, '主题 · Catppuccin'),
          React.createElement('div', { className: 'cppc-flavors' },
            FLAVORS.map((f) => React.createElement('button', {
              key: f.id,
              type: 'button',
              className: 'cppc-flavor',
              'data-active': flavor === f.id || undefined,
              onClick: () => pickFlavor(f.id)
            },
              React.createElement('div', { className: 'cppc-swatches' },
                ['base', 'mantle', 'surface0', 'text', 'mauve'].map((k) => React.createElement('span', { key: k, className: 'cppc-swatch', style: { background: PALETTE[f.id][k] } }))
              ),
              React.createElement('div', { className: 'cppc-flavorName' }, f.label),
              React.createElement('div', { className: 'cppc-flavorScheme' }, f.scheme === 'light' ? '浅色' : '深色')
            ))
          ),
          React.createElement('div', { className: 'cppc-sectionTitle' }, '强调色'),
          React.createElement('div', { className: 'cppc-accents' },
            ACCENTS.map((a) => React.createElement('button', {
              key: a.id,
              type: 'button',
              title: a.label,
              className: 'cppc-accent',
              'data-active': accent === a.id || undefined,
              style: { background: PALETTE[flavor][a.id] },
              onClick: () => pickAccent(a.id)
            }))
          ),
          React.createElement('div', { className: 'cppc-hint' }, '设置会自动保存，刷新页面或重启 Web 后仍然保留。字体请使用 DSH 原生设置（设置 → 通用 → 更多字体设置）调整，本插件不再覆盖字体。')
        )
      }

      ctx.slots.inject('settings.section', () => ctx.slots.register(
        { name: 'settings.section', id: 'catppuccin-x-personalize', order: 8, label: () => 'Catppuccin' },
        () => React.createElement(PersonalizePage)
      ))
    }

    // ── 执行中文字流光：整段文字染成「蓝 ↔ 强调色 ↔ 紫」三色渐变并循环流动 ──
    // DSH 0.2.x 的 TextShimmer（primitives）渲染成：
    //   [data-shimmer] > span(content)            ← base 文本
    //                  > span[inert](decoration)  ← 旧版扫光副本（1.5s 位移高光）
    // 0.1.7 那套按 data-text-shimmer 属性覆盖 background-image 的做法在新版已完全
    // 失效（属性都没了），这里按当前结构重写：
    //  - 隐藏 decoration：native 的 mask 高光与 background-clip:text 同时使用时会让
    //    副本整层消失，且单色高光也不再是想要的效果；
    //  - 直接给 content 上渐变 + background-clip:text，-webkit-text-fill-color 把
    //    base 文本变成渐变字形；4s 线性循环平移 background-position（200%→0）形成
    //    从左向右的流动。
    // 三色 --cppc-shimmer-1/2/3 由 buildTokens（默认 mauve）与 syncAccent（跟随用户
    // 强调色）写入，浅色 / 深色 flavor 各取自己的调色板值。
    // 选择器只依赖稳定属性 [data-shimmer] / [inert]；content 是 root 的第一个 span
    // 子节点，`> span:first-child` 比构建哈希类名稳。reduced-motion 下整条规则不
    // 生效，交回原生表现（原生同样会隐藏 decoration）。
    const SHIMMER_CSS =
      '@media (prefers-reduced-motion:no-preference){' +
      ':root [data-shimmer] > span:first-child{' +
      'background-image:linear-gradient(100deg,' +
      'var(--cppc-shimmer-1) 0%,' +
      'var(--cppc-shimmer-2) 33.333%,' +
      'var(--cppc-shimmer-3) 66.667%,' +
      'var(--cppc-shimmer-1) 100%);' +
      'background-size:200% 100%;' +
      '-webkit-background-clip:text;background-clip:text;' +
      '-webkit-text-fill-color:transparent;' +
      'animation:cppc-text-flow 4s linear infinite' +
      '}' +
      ':root [data-shimmer] [inert]{display:none}' +
      '}' +
      '@keyframes cppc-text-flow{from{background-position:200% 50%}to{background-position:0% 50%}}'

    // ── 样式插入（带清理的轻量实现，替代动态模式的 styles builtin） ────────

    /**
     * 插一条**本插件拥有**的样式表。
     *
     * `data-plugin` 必须自己打上：宿主只认领「未打标」的标签，漏了它的话，这条样式
     * 会被下一个物化的插件记到名下 —— 那个插件一换版就把它删掉，而这里的插值
     * （桌面侧栏 / 高亮）只在设置变化时重建，于是它会一直缺到刷新页面。
     * 打了标之后：换版由宿主回收、由本插件重建，禁用插件时两边都收干净。
     * 清理仍然由调用方通过返回的 disposer 负责（与宿主回收是同一件事，幂等）。
     */
    function stylesInsert(css) {
      const style = document.createElement('style')
      style.setAttribute('data-plugin', 'dsh-catppuccin-x')
      style.setAttribute('data-plugin-css', 'dsh-catppuccin-x/dynamic-' + Math.random().toString(36).slice(2))
      style.textContent = css
      document.head.append(style)
      return () => { style.remove() }
    }

    // dsh-plugin-desktop 高级模式（Enhanced Mode）下，桌面外壳注入
    // `.dshDesktopSidebarSurface{--dsw-specific-sidebar-fill:transparent;
    // background:transparent}`，把侧栏背景强制为透明以配合 mica 玻璃效果。
    // 该本地变量覆盖了本插件注入到 <body> 的主题令牌，导致侧栏背景透出
    // 透明窗口底（黑色），与主题不匹配。这里用更高优先级的选择器把侧栏
    // 背景重新断言为当前 flavor 的 mantle 色，恢复与主题一致。
    let disposeDesktopSidebar = () => {}
    function applyDesktopSidebar(f) {
      disposeDesktopSidebar()
      disposeDesktopSidebar = () => {}
      const mantle = PALETTE[f].mantle
      disposeDesktopSidebar = stylesInsert(
        'body[data-dsh-desktop-mode="advanced"] .dshDesktopSidebarSurface{' +
        '--dsw-specific-sidebar-fill:' + mantle + ';' +
        'background:' + mantle + ';' +
        '}'
      )
    }

    exports.name = 'catppuccin-x'
    exports.inject = inject
    exports.apply = apply
    return module.exports
  }
})

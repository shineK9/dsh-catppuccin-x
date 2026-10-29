# DSH 主题 Token 参考

这里是 DeepSeek Harness 内置主题 token 的**生成物**，用来做主题插件（本仓库）后续优化的参考：

| 文件 | 内容 |
| --- | --- |
| [dsh-theme-tokens.md](dsh-theme-tokens.md) | 完整分组表：507 个 token，浅色 / 深色两套值，`✓` 标记本插件已覆盖 |
| [dsh-theme-tokens.html](dsh-theme-tokens.html) | 同一份数据的单文件查看器：搜索、按分组筛选、「只看插件已覆盖」、点击复制 |

## 数据来源

- `app.asar` 内置主题样式：`body` / `body[data-ds-dark-theme]` / `:root` 里的 token 定义（浅色 + 深色）；
- 组件 CSS 里**实际消费**、但没有全局定义的变量（`var(--x, fallback)`），例如 `--dsh-chat-content-width`；
- 本插件 `lib/client.js` 的覆盖清单（`buildTokens` / `overrideTokens` / 静态 CSS）。

只收录内置样式实际定义或使用的 token —— 自己编一个名字写进 CSS 不会生效。分组含义见 md 的「分组概览」。

## 覆盖方式（从稳到脆）

1. **主题 token**：`ctx.theme.register({ tokens })` —— 每个 flavor 一套，最稳，本插件的主要方式；
2. **强调色层**：`ctx.theme.overrideTokens()` —— 叠加在任意活动主题上，适合跟随 accent 的值；
3. **作用域 CSS**：在插件注入的 `<style data-plugin>` 里写 `[data-...]{--token: value}` —— 用于组件内联写死的变量（如 hovercard）或 `::selection` 这类伪元素。

不建议直接写构建哈希类名（如 `LOmM4q_bubble`）：DSH 一升级就会失效。气泡等组件优先用 `[data-chat-flow-kind="user"]`、`[data-shimmer]`、`[data-slot="conversation.chat.flow"]` 这类稳定属性作用域。

## 已接管 / 不建议动

- 已接管（`✓`）：主界面层级、文字、边框、按钮、状态、滚动条、markdown、侧栏、tooltip / 菜单 / toast、diff、Shiki 代码高亮、onboarding、hovercard、文本选择等。
- 不建议动：`--dsw-static-neutral-*` / `neutral-bluish-*`（承担白/黑/半透明语义）、字号 / 圆角 / 间距体系（`--dsw-radius-*`、`--dsh-*-font-size`）、布局变量。主题只决定颜色与明暗层级。

## 刷新

DSH 升级后 token 可能增删，重新生成即可（脚本不依赖本机路径，asar 路径作为参数传入）：

```bash
node scripts/extract-theme-tokens.mjs "<path-to-app.asar>"
```

> 这两个文件是生成物，不要手改；要调整输出就改 `scripts/extract-theme-tokens.mjs`。

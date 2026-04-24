# POC P-03 · Web Components + tokens.css :root vars 穿透 + 样式隔离

**课题**:
1. **tokens 穿透**:主文档 `<link rel=stylesheet href=tokens.css>` + `:root { --accent: #a78bfa }` · Web Component shadow DOM 内 `<style>var(--accent)</style>` 能读到紫色吗?
2. **样式隔离**:主文档注 `<style>* { color: red !important }</style>` · shadow DOM 内 `.tab.cur` 保持原色(不穿透)?
3. **属性选择器**:`:host([kind="scene"]) .track` 按 host attribute 切 background 能生效?
4. **adoptedStyleSheets vs :root**:哪个性能好?Chromium / WebKit 支持度?

**背景 + affects_scenarios**: v0.2 视觉 (S-07~S-11 · 5 个) + 架构 (S-12~S-14 · 3 个) 共 8 scenarios 押这 POC。若 tokens 穿透不工作 · 所有组件要内嵌一份 tokens 值(脆) · 或走 CSS custom properties via JS(复杂)。

## 方案要求

**做 1 份 POC HTML + 4 段 JS 测试**:

1. **测试 A**(tokens 穿透):
   - index.html `<link href=tokens.css>` + `:root { --accent: #a78bfa }`
   - `<nf-demo>` 内 shadow `<style>.box { background: var(--accent); }</style>`
   - 开浏览器 · `getComputedStyle(document.querySelector('nf-demo').shadowRoot.querySelector('.box')).backgroundColor` · 期望 `rgb(167, 139, 250)`
   - JS 改 `document.documentElement.style.setProperty('--accent', '#ff0000')` · 重查 · 期望 `rgb(255, 0, 0)`

2. **测试 B**(主文档污染不穿):
   - 注 `<style>* { color: red !important }</style>` 到 `<head>`
   - `getComputedStyle(...shadowRoot.querySelector('.tab.cur')).color` · 期望 **不为 red**(保持原色)
   - 清理:remove 注入 style · 恢复

3. **测试 C**(:host([attr]) 属性选择器):
   - `<nf-track kind="scene">` + `<nf-track kind="text">` + `<nf-track kind="audio">`
   - 组件内 `:host([kind=scene]) .stripe { background: var(--accent) }` · `:host([kind=text]) .stripe { background: var(--amber) }` · `:host([kind=audio]) .stripe { background: var(--teal) }`
   - 3 个组件渲染出 3 色 stripe · 肉眼 + JS 验

4. **测试 D**(adoptedStyleSheets 对比):
   - 方案 1(单 :root link)· 方案 2(每组件 `shadowRoot.adoptedStyleSheets = [sharedSheet]`)
   - 10 组件渲染时间对比 · `performance.mark` + `performance.measure`
   - 切 --accent 后 repaint 时间

## 实施步骤

1. 独立 worktree `.worktrees/v0.2-poc-P-03-{opus|ally}`
2. 建 `poc-wc-tokens/` 目录 · 不需要 Rust · 纯 HTML + TS + CSS
3. `index.html`(主页)+ `tokens.css`(:root 定义)+ `components/nf-demo.ts` + `components/nf-track.ts`
4. 用 `npm init -y` + `npm i esbuild typescript` · bundle 出 `dist/index.js`
5. 用 `playwright` 或手动打开 Safari / Chrome 跑 4 测试 · 截每测试前后对比
6. 记 computed-style 值 + 性能数字

## 验收数字

- [ ] 测试 A · var(--accent) 在 shadow 读到 紫色 · 改主文档 :root 后组件联动红色(tokens 穿透 OK)
- [ ] 测试 B · 主文档 `* { color: red }` 不影响 shadow 内文字色(隔离 OK)
- [ ] 测试 C · 3 不同 kind 组件渲染 3 不同 background 色(:host 属性 OK)
- [ ] 测试 D · adoptedStyleSheets vs :root 两方案性能 · 记实测数字 · 推荐一个(短代码 + 快性能)

**若不过**:
- tokens 不穿透 · 方案改 `shadowRoot.adoptedStyleSheets` 挂 tokens sheet
- 隔离不成立 · 极端 · 不太可能(shadow 标准)· 记 · 整 v0.2 架构改
- :host attr 不支持 · 用 class 切(每 kind 一个 class)
- 性能差 · v0.2 组件数 ≤ 8 · 性能无虞 · 记上限

## 输出要求

**路径**:
- opus:`spec/poc/P-03-wc-tokens/opus/`
- ally:`spec/poc/P-03-wc-tokens/ally/`

文件:
- `report.md` frontmatter(affects_scenarios: [S-07, S-08, S-09, S-10, S-11, S-12, S-13, S-14])
- `src/index.html` + `src/tokens.css` + `src/components/*.ts` + `dist/index.js`(esbuild bundle)
- `screenshots/` 4 对比 PNG

## 时间预期

20-40 min · Web Components 成熟标准 · 应快。

## 关键参考

- MDN Custom Elements v1
- W3C CSS Custom Properties Level 1(继承规则 · 跨 shadow 穿透)
- `adoptedStyleSheets` API · Safari 16.4+ / Chrome 73+

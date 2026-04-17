# nf-core-engine (v2.0, implement)

**Source → Resolved 编译 + bundle + byte-stable writeBack**。TS（Node 侧）。

## 核心职责

1. 解析 Source 锚点表达式（`@intro_start + 200ms` / `@prev - 1s` / 纯数字 / `{ref:...}`）→ 计算出精确毫秒数
2. 展开引用、拓扑序依赖解析 → 产出 Resolved JSON（带 `anchors_meta` 追踪 source_line）
3. 把 Resolved 和所需的 tracks `.js` 内联到一个 HTML 里（bundle），外加图片/音频 data URL inline
4. 源级 byte-stable writeBack（L2+L3+L4 per POC P-006）— AI edit → 源文件 1-line diff

## 模块

| 文件 | 说明 |
|------|------|
| `parser.ts` | `JSON.parse` + viewport shape check + anchor 行号扫描 |
| `expr.ts` | 手写递归下降表达式求值（`+ - * /`、括号、`@`-前缀、`ms`/`s` 单位） |
| `topo.ts` | Kahn 拓扑排序 + `CyclicAnchors` / `UnknownRef` |
| `anchor.ts` | 组合 parser + expr + topo，产出 `ResolvedBundle` + `anchors_meta` |
| `validate.ts` | 带 error code 的 JSON 报告（anchor-cycle / anchor-undefined / viewport-mismatch / viewport-ratio-invalid） |
| `bundler.ts` | Track 模块 IIFE 包 + 资源 base64 data URL inline |
| `writeback.ts` | JSON 文本精准点修改（scanner + span patching）L2+L3+L4 |
| `cli.ts` | `build` / `validate` / `writeback` + `--resolve-only` |

## CLI

```bash
node dist/cli.js build <src> -o <out.html>           # 单文件 bundle
node dist/cli.js build <src> --resolve-only -o <out.json>  # 只 resolved
node dist/cli.js validate <src>                      # JSON 报告 + exit 0/1
node dist/cli.js writeback <src> <edit.json>         # L2 稳定 patch + diff
```

## 边界

- ❌ 不渲染、不接 WebView — 只做文本处理
- ❌ 不 watch（那是 nf-cli + nf-shell 的事）
- ✅ 输入 `source.json` + `src/nf-tracks/` 组件目录 → 输出 `bundle.html`
- ✅ stripESM：Track `.js` 会被内联进 HTML（不走 ESM import）
- ✅ CLI JSON-only（无 free-form print）

## Tests

`node --test src/` → 6 suites, 41 tests:
anchor / bundler / expr / topo / validate / writeback

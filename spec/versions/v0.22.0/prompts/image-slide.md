# 任务 · v0.22.0 · html.image-slide v2 component

主 agent 持锁 `feature:v0.22.0-poster`。你是 v0.22.0 的 **image-slide** 组件路 · 写 1 个 NextFrame v2 component(JS · single-file · import-free)。

## 工作根

```
/Users/Zhuanz/workspace/NextFrame/.worktrees/v0.22.0-0e3c8b70
```

## 必读现状

```bash
cat spec/charter.md                                              # 北极星 + 红线
cat spec/architecture.md                                         # 对象模型 + ABI
cat spec/design/DESIGN.md                                        # 视觉规范
cat examples/v2-showcase/components/html.stage-background.js     # 看现有 component ABI 样板
cat examples/v2-showcase/components/html.sequence-title.js       # 看 update 时如何改 DOM
cat examples/v2-showcase/compositions/voice-subtitle-smoke.json  # 看 audio + subtitle track 怎么写
cat crates/nf-project/src/lib.rs | grep -A 30 'fn validate_component'    # ABI 校验规则
```

## harness preflight(硬)

```bash
harness tools
harness search "validate"
harness show nf-composition
```

复用 `nf composition validate` 验组件 · 不造新工具。

## 交付 1 件

### `examples/v021-explain/components/html.image-slide.js`

**主题** · 显示 1 张 PNG 占满 1920x1080 视口 · 接 `params.src` (相对路径)· track time 控制显示 / 隐藏。

**ABI 硬要求**(NextFrame v2 component · 不可破):

1. **single-file** · 只 1 个 .js 文件 · 没有任何 import / require / fetch
2. **import-free** · 全 inline · 不引外部 lib
3. **export `mount(root, params, ctx)`** · 创建 DOM · 返回 instance handle
4. **export `update(instance, params, ctx)`** · 接 params 变更 · in-place 更新 DOM
5. **export `unmount(instance)`** · 清理(可选 · 不强制)
6. 看 `examples/v2-showcase/components/html.stage-background.js` 是范本

**功能要求**:

1. mount 时:在 root 里创 `<img>`(或 `<div>` background-image · 看哪个更稳)· 占满 root 容器(`width: 100%; height: 100%; object-fit: cover` 或 background-size: cover)
2. params 字段:
   - `src` · string · 必填 · 相对 episode root 的 PNG 路径(运行时 ctx 会给 base url)
   - `fit` · string · 可选 · 'cover' / 'contain' · 默认 'cover'
   - `bg_color` · string · 可选 · 后景色(图片透明区显示)· 默认 '#000'
3. update 时 · 如果 `src` 变化 · 替换图源(避免闪烁 · 最好 image preload 后再切)
4. ctx · 看现有 component 怎么用 · 提取 base url · 拼真实 PNG URL

**禁**:不 fetch / 不 import / 不 console.log spam / 不动 v2 schema / 不动 nf-* runtime / 不 commit。

## 同时:让 examples/v021-explain 这个项目可被 NextFrame 识别

确保下面目录骨架存在(可空):

```
examples/v021-explain/
├── components/
│   └── html.image-slide.js  ← 你写的
├── audio/                   ← 路 B 会填
├── compositions/            ← 路 B 会填
└── project.json             ← 你写一个最小 project.json (id="v021-explain", name="...", version="v0.22.0")
```

参考 `examples/v2-showcase/project.json` 写法。

## 自验

跑通这两条:

```bash
ls examples/v021-explain/components/html.image-slide.js
ls examples/v021-explain/project.json
```

写完后再核(注意 · 此时 composition 还没 · 验证不到)· 等路 B 把 composition 拼出来后 · 主 agent 跑 `nf composition validate` 闭环。

## 报告

- ✅/❌ html.image-slide.js 文件存在 · `wc -l` 行数
- ✅/❌ 单文件 · 无 import/require/fetch · `grep -E "^(import|const.*require|fetch\\()" examples/v021-explain/components/html.image-slide.js` 应空
- ✅/❌ export mount + update 函数
- ✅/❌ project.json 存在
- 一句话 · 你做了啥 + 为啥这么实现

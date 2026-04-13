# 依赖规范

## 依赖方向（单向，禁止循环）

```
cli → shell → bridge → recorder
              bridge → runtime/web（文件服务）
           recorder → runtime/web（WebView 加载）
         runtime/web → bridge（IPC 调用）
```

## 模块边界

| 层级 | 对外窗口 | 可见性 | 调用方式 |
|------|---------|--------|---------|
| crate 之间 | lib.rs re-export | `pub` | trait 或函数 |
| 模块之间 | mod.rs re-export | `pub(crate)` | trait 或 re-export |
| 子模块之间 | 函数签名 | `pub(super)` | 直接调用 |

## 禁止事项

- bridge 不准直接 import recorder 内部类型（通过 recorder_bridge 转换）
- shell 不准绕过 bridge 直接操作文件系统
- runtime/web 各子模块不准相互 import（通过全局状态或事件通信）
- scenes-v2 组件不准 import modules/（只依赖 scenes-v2-shared.js）

## 外部依赖

**原则：默认自己造，除非三条同时满足：标准功能 + 上限够 + 不绑架架构。**

允许的库：

| 用途 | Rust 库 | 理由 |
|------|---------|------|
| 异步运行时 | tokio | 标准、无替代 |
| HTTP 服务 | hyper | 底层、无框架 |
| 序列化 | serde + serde_json | 标准 |
| CLI | clap | 标准 |
| macOS 原生 | objc2 | 底层 FFI |
| 图像 | png | 最小依赖 |
| WebView | wry + tao | 底层、无框架 |

禁止：Tauri、Electron、React、Vue、Bevy、Actix-web 等一切框架。

## 自动化

```bash
# Rust 循环依赖
cargo clippy --workspace 2>&1 | grep -i circular  # 应为空

# JS 跨模块非法 import
grep -rn "from.*modules/" runtime/web/src/scenes-v2/ --include='*.js'  # 应为空
```

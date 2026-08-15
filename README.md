# 个人工作台

> 工作生活一体化本地管理应用 · PC 桌面版 + Android 移动端

## 📖 项目简介

个人工作台是一款**纯本地运行**的个人效率管理工具，将日程规划、项目追踪、健身饮食记录、游戏清单和 AI 智能对话整合到一个统一界面中。数据完全存储在浏览器本地（IndexedDB + localStorage），无需任何后端服务。

项目同时提供两个运行平台：
- **PC 桌面版**：基于 Electron 打包为 Windows 可执行文件
- **Android 移动端**：基于 WebView 封装为 APK

## 🛠 技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| 前端框架 | 原生 HTML + CSS + JavaScript | 单文件 SPA，hash 路由，无任何第三方 JS 库 |
| 路由系统 | 自研 `ROUTES` + `hashchange` | 约 20 行代码实现的轻量路由 |
| 数据存储 | IndexedDB v3 | 12 个 Object Store，大容量结构化存储 |
| 存储后备 | localStorage | 关键配置项 + IndexedDB 不可用时的降级方案 |
| PC 封装 | Electron | `BrowserWindow` 加载本地 `index.html`，关闭菜单栏 |
| Android 封装 | Kotlin + Android WebView | `file:///android_asset/www/index.html` |
| Android 构建 | Gradle 9.5.0 + JDK 17 | AGP 8.9.1，compileSdk 35 |
| 版本管理 | `version.properties` | Gradle 自动递增 +0.1，无需手动改 build.gradle |
| AI 集成 | OpenAI 兼容 API | 支持 DeepSeek / 豆包 / 通义 / 千帆 / 自定义代理 |
| AI 消息渲染 | 自研 `simpleMd()` | 支持表格、代码块、行内代码、加粗、列表、三级标题 |

## 📂 目录结构

```
Project02/
├── 个人工作台/                    # PC 端 Electron 应用
│   ├── 源代码/                    # 工作副本（开发用）
│   │   ├── index.html             # 单页面入口（~77 行）
│   │   ├── main.js                # Electron 主进程（~29 行）
│   │   ├── app.js                 # 应用核心逻辑（~2092 行）
│   │   ├── styles.css             # 全局样式 + 主题变量（~1100+ 行）
│   │   └── package.json           # Electron 包描述
│   ├── resources/                 # Electron 运行时资源
│   │   ├── app/                   # asar 解包的运行副本
│   │   └── app.asar               # Electron 打包产物（旧版本有 .bak）
│   ├── install_to_mumu.ps1        # MuMu 模拟器一键安装脚本
│   ├── start_debug.bat            # 调试启动脚本
│   ├── CHANGELOG.md               # 变更日志
│   ├── README.md                  # 本文档
│   └── 个人工作台.exe              # 打包后的可执行文件
│
├── android_workbench/             # Android 工程
│   ├── app/
│   │   ├── build.gradle           # 模块配置 + 自动备份/版本递增逻辑
│   │   └── src/main/
│   │       ├── AndroidManifest.xml
│   │       ├── java/.../MainActivity.kt  # WebView 容器（~91 行）
│   │       ├── res/               # 资源文件
│   │       └── assets/www/        # 前端源码副本（index.html + app.js + styles.css）
│   ├── build.gradle               # 根项目配置
│   ├── settings.gradle
│   ├── version.properties         # 版本号（versionName + versionCode）
│   ├── gradle.properties          # 含 android.overridePathCheck=true
│   └── gradlew.bat                # Gradle Wrapper
│
└── GitHub上传版/                   # 用于上传 GitHub 的精简副本
```

## ✨ 功能模块（11 个路由）

### 🗂 基础数据模块

| 路由 | 图标 | 说明 | IndexedDB Store |
|------|------|------|-----------------|
| 首页总览 | 🏠 | 快速备忘 + 今日计划 + 高优摘要 + 统计 + 模块快捷入口 | notes, todos, media, develop, consult, fitness, diet, game |
| 今日计划 | 📅 | 待办清单，支持优先级、截止时间、完成状态 | todos |
| 自媒体 | 📱 | 选题/内容追踪 | media |
| 开发工作 | 💻 | 项目/任务管理 | develop |
| 咨询工作 | 💼 | 客户/跟进状态追踪（open/doing/done/block） | consult |
| 健身计划 | 💪 | 训练计划（全身/胸背肩腿/上下肢/推拉腿） | fitness |
| 饮食计划 | 🍱 | 一日四餐记录（早/午/晚/加餐） | diet |
| 游戏娱乐 | 🎮 | 游戏清单 | game |

### 🤖 AI 对话模块（#/ai）

独立的智能对话界面，功能亮点：
- **多 Provider 切换**：DeepSeek / 豆包 (Volcengine) / 通义千问 / 文心一言 / 自定义代理
- **主题色系统**：5 套预设（柔和米色 / 暖黄活力 / 薄荷清新 / 樱花浪漫 / 薰衣草紫）+ 自定义取色器自动推导明暗层次
- **头像自选**：AI 头像 16 个 emoji + 用户头像 16 个 emoji + 本地图片上传（base64 存 localStorage）
- **Markdown 渲染**：AI 回复支持表格、代码块、行内代码、加粗、列表、三级标题
- **悬浮球 + 快捷面板**：任意页面右下角点击 🤖 快速发起对话
- **对话历史持久化**：IndexedDB v3 存储 aiConvs（会话）+ aiMsgs（消息）

### 👤 个人中心（#/profile）
- 昵称 / 简介 / 头像编辑
- 统计面板（总任务数、完成率、AI 对话次数等）
- 编辑资料弹窗（修复过 null 崩溃，改用闭包 `modal.querySelector`）

### ⚙️ 数据与设置（#/setting）
- **AI 配置**：Provider 选择 / API Key（密码模式）/ 模型选择 / 自定义 API URL / 系统提示词
- **数据导出**：一键导出全部 IndexedDB 数据为 JSON 文件
- **数据导入**：从 JSON 文件恢复
- **数据重置**：清空全部本地数据

## 🗄 数据架构

### IndexedDB v3

数据库名：`personal_workbench`，版本：3，共 12 个 Object Store：

```javascript
const STORES = [
  'todos',       // 今日计划
  'media',       // 自媒体
  'develop',     // 开发工作
  'consult',     // 咨询工作
  'fitness',     // 健身计划
  'diet',        // 饮食计划
  'game',        // 游戏娱乐
  'notes',       // 快速备忘
  'recycleBin',  // 回收站（预留）
  'config',      // 配置项
  'aiConvs',     // AI 对话会话
  'aiMsgs'       // AI 对话消息
];
```

所有 Store 使用 `id` 作为 keyPath，通过 `DBgetAll / DBget / DBput / DBadd / DBdelete` 五个统一方法操作。

### localStorage 后备

- `personal_profile`：用户个人资料 JSON
- `ai_theme_key` / `ai_theme_vars`：AI 对话主题配置
- `ai_avatar_ai` / `ai_avatar_user`：AI/用户头像设置
- AI 配置变更时先校验 provider.models 白名单，不在列表中则回退 defaultModel

### 降级策略
IndexedDB 打开失败时会调用 `resetDBAndRetry()`（删除旧 DB 重建）；仍失败则所有数据操作返回空数组或 null，应用不崩溃。

## 🔌 AI 集成详解

### Provider 配置

```javascript
const AI_PROVIDERS = {
  deepseek: {
    label: 'DeepSeek',
    defaultUrl: 'https://api.deepseek.com/v1/chat/completions',
    defaultModel: 'deepseek-chat',
    models: ['deepseek-chat', 'deepseek-reasoner']
  },
  doubao: {
    label: '豆包 (Volcengine)',
    defaultUrl: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions',
    defaultModel: 'doubao-seed-evolving',
    models: ['doubao-seed-evolving', 'doubao-seed-1-6-250615', ...]
  },
  qwen: { /* 通义千问 */ },
  wenxin: { /* 文心一言 */ },
  custom: { /* 自定义代理 */ }
};
```

### API Key 格式注意

| Provider | API Key 格式 | 端点协议 |
|----------|-------------|---------|
| DeepSeek | `sk-xxxxxxxx` | OpenAI 兼容 |
| 豆包 (Volcengine) | UUID 格式 `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` | OpenAI 兼容 |
| 通义千问 | `sk-xxxxxxxx` | OpenAI 兼容 |
| 文心一言 | `sk-xxxxxxxx` | OpenAI 兼容 |
| 自定义 | 取决于代理 | 必须 OpenAI 兼容 |

> **⚠️ 常见错误**：用 DeepSeek 的 `sk-` 格式 API Key 配豆包会报 401；用废弃模型名（如 `doubao-pro-128k`）会报 404。

### 消息角色校验

AI 对话历史中只保留 `role: 'user'` 或 `role: 'assistant'` 的消息，自动过滤 `error` 等无效角色（否则 DeepSeek 报 400 invalid_request_error）。

### Markdown 渲染能力

自研 `simpleMd()` 函数实现，支持语法：

| 语法 | 示例 | 渲染结果 |
|------|------|---------|
| 表格 | `\| 列1 \| 列2 \|` | `.md-table` 结构化卡片 |
| 代码块 | ` ```lang\ncode\n``` ` | `.md-code-block` 深色 pre |
| 行内代码 | `` `code` `` | `.md-code-inline` 高亮 code |
| 加粗 | `**文字**` | `.md-strong` 紫色 span |
| 列表 | `- 项` / `* 项` | `.md-list` ul |
| 三级标题 | `### 标题` | `.md-h3` div |

## 🏗 构建与部署

### PC 桌面版（Electron）

**运行开发模式**：
```bash
# 前提：已安装 Node.js 和 Electron
cd 源代码/
npm install electron
npx electron .
```

**打包为 EXE**：
```bash
# 使用 electron-builder 或 electron-packager
# 源码会被 asar 打包进 resources/app.asar
asar pack ../源代码 app.asar
# 替换 EXE 目录中的 app.asar
```

> **注意**：Windows 可能会锁住正在运行的 app.asar 文件，关闭所有相关进程后再打包，或复制整个 EXE 目录到新位置操作。

### Android 移动端

**前置条件**：
- JDK 17
- Android SDK（platforms;android-35、build-tools 35.x）
- Gradle Wrapper（项目自带）
- `gradle.properties` 中已配置 `org.gradle.java.home` 指向 JDK 17
- `gradle.properties` 含 `android.overridePathCheck=true`（路径含中文必须）

**构建命令**：
```bash
cd android_workbench
.\gradlew.bat assembleDebug --offline
```

**构建自动化流程**（已在 build.gradle 中配置）：
1. `backupOldApk` 任务 → 把旧 APK 从 `build/outputs/apk/debug/` 移到 `backup/` 目录
2. `assembleDebug` 主构建任务
3. `bumpVersion` 任务 → `versionName` 自动 +0.1（如 `1.15.0` → `1.16.0`），`versionCode` +1

**APK 命名格式**：`个人工作台_v{versionName}_debug.apk`

**app_name 自动更新**：构建时自动把 `strings.xml` 中的 app_name 改为 `个人工作台 v{versionName}`。

### 安装到 MuMu 模拟器

**一键脚本** `install_to_mumu.ps1`：
```powershell
# 用法：PowerShell 直接运行
powershell -File install_to_mumu.ps1
```

脚本做了什么：
1. 自动查找 `android_workbench/app/build/outputs/apk/debug/` 下最新 APK
2. 重启 adb server（解决 MuMu adbd 易断连问题）
3. 尝试连接 MuMu 三个端口：`7555` / `16384` / `7556`
4. 执行 `adb install -r` 安装覆盖
5. 执行 `am start` 启动应用

**手动安装**：
```bash
adb connect 127.0.0.1:7555
adb install -r app-debug.apk
adb shell am start -n com.personal.workbench/.MainActivity
```

### Android WebView 特殊处理

MainActivity.kt 关键配置：
- `settings.javaScriptEnabled = true`
- `settings.domStorageEnabled = true`（启用 localStorage + IndexedDB）
- `settings.databaseEnabled = true`
- `settings.setAllowFileAccessFromFileURLs(true)`（IndexedDB 在 file:// 协议下必需）
- `settings.setAllowUniversalAccessFromFileURLs(true)`
- `webView.loadUrl("file:///android_asset/www/index.html")`

### Android 兼容性 Shim

Android WebView 缺少浏览器 Notification API。`app.js` 顶部有一段 shim：

```javascript
// 检测 Android/WebView 环境，mock Notification 防止 ReferenceError
if (typeof Notification === 'undefined') {
  window.Notification = {
    permission: 'granted',
    requestPermission: () => Promise.resolve('granted'),
    constructor: function(title, options) { console.log('[Notification]', title, options); }
  };
}
```

## 📋 开发工作流规范

### 版本号规则
- Android 端只改 `version.properties`，格式：`major.minor.0`（如 `1.15.0`）
- 每次 `assembleDebug` 自动 +0.1，无需手动编辑 build.gradle
- 应用标题自动显示版本号（`个人工作台 v1.15.0`）

### 备份规则
每次修改源代码前：
```powershell
$ts = Get-Date -Format 'yyyyMMdd_HHmmss'
Copy-Item -Recurse 源代码 "源代码_backup_$ts"
```

### 变更记录
所有变更需同步更新 `CHANGELOG.md`，格式参考已有条目。

### 多端同步清单

修改前端源码后，需同步更新以下位置：

| 位置 | 路径 | 同步方式 |
|------|------|---------|
| PC 工作副本 | `个人工作台\源代码\` | ✅ 直接编辑 |
| Electron 运行时 | `个人工作台\resources\app\` | 手动复制或重新 asar 打包 |
| Android 前端资源 | `android_workbench\app\src\main\assets\www\` | 手动复制 |
| GitHub 上传版 | `GitHub上传版\个人工作台\源代码\` | 手动复制 |

## 🐛 已知问题与历史踩坑

| 问题 | 原因 | 解决方案 |
|------|------|---------|
| IndexedDB v1→v2 升级失败 | 旧库结构锁死导致 `openDB()` 返回 null | 删除重建：`resetDBAndRetry()` |
| WebView `new Date('ISO-T格式')` 抛异常 | `file://` 协议下 Date 解析器不同 | 改用手动字符串切分解析 |
| Notification is not defined | Android WebView 无 Notification API | shim 注入 mock 对象 |
| Gradle 配置缓存导致构建失败 | AGP 8.9.1 + Gradle 配置缓存不兼容 | 构建时加 `--no-configuration-cache` 或 `--offline` |
| `querySelector('.modal-backdrop')` 命中空壳 | index.html 预存了空容器 `.modal-backdrop` | 闭包变量 `modal.querySelector` 限定作用域 |
| API Key 401 | DeepSeek `sk-` 格式误配豆包 | 豆包必须用 UUID 格式 API Key |
| 废弃模型名 404 | `doubao-pro-128k` 已下线 | 改用 `doubao-seed-evolving` |
| 中文路径 Gradle 报错 | AGP 路径检查 | `gradle.properties` 加 `android.overridePathCheck=true` |

## 📜 版本历史

详见 [CHANGELOG.md](CHANGELOG.md)。

## 📄 许可证

个人自用项目。

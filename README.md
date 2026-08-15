# 个人工作台 (Personal Workbench)

> 工作生活一体化的本地管理应用，支持 Windows PC 桌面版和 Android 手机版

![License](https://img.shields.io/badge/license-MIT-green)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20Android-blue)
![Tech](https://img.shields.io/badge/tech-Electron%20%7C%20WebView%20%7C%20HTML%2FCSS%2FJS-orange)

---

## 目录

- [功能亮点](#功能亮点)
- [项目结构](#项目结构)
- [源代码说明](#源代码说明)
- [开发环境准备](#开发环境准备)
- [PC版（Windows EXE）开发与打包](#pc版windows-exe开发与打包)
- [Android版（APK）开发与打包](#android版apk开发与打包)
- [安装与使用](#安装与使用)
- [AI对话功能配置](#ai对话功能配置)
- [常见问题（FAQ）](#常见问题faq)

---

## 功能亮点

| 模块 | 说明 |
|------|------|
| 🏠 **首页仪表盘** | 今日待办、数据统计、备忘、快捷入口一站式查看 |
| 📋 **今日计划** | 任务管理、优先级、截止日期提醒、进度追踪 |
| 🤖 **AI 对话** | 支持豆包/DeepSeek/通义千问等多提供商，浮动球快捷入口 |
| 💻 **开发项目** | 项目分组管理、任务进度可视化、进度条统计 |
| 🍎 **饮食记录** | 每日三餐热量计算、营养汇总、数据统计 |
| 🏋️ **健身计划** | 训练计划打卡、体能数据记录、进度追踪 |
| 🎮 **游戏计时** | 游戏时长控制、计时器、每日上限提醒 |
| 📞 **咨询工单** | 时间线记录、工单状态管理 |
| ✍️ **自媒体** | 草稿编辑、发布计划、内容管理 |
| 👤 **个人中心** | 用户资料、数据统计、数据导出/导入/备份/重置 |
| ⚙️ **系统设置** | 全局配置、AI配置、回收站、数据管理 |

---

## 项目结构

```
Project02/
├── .gitignore                      # Git 忽略配置（不要提交 API Key、构建产物）
├── README.md                       # 本使用文档
│
├── 个人工作台/                      # ===== PC 桌面版（Electron） =====
│   ├── 个人工作台.exe               # 主程序（直接运行）
│   ├── resources/
│   │   └── app.asar                # 打包后的应用代码
│   └── 源代码/                      # 源代码（开发和修改在这里）
│       ├── package.json            # Electron 应用配置
│       ├── main.js                 # Electron 主进程（窗口管理）
│       ├── index.html              # 应用主页面结构
│       ├── styles.css              # 所有 UI 样式（现代化卡片式设计）
│       ├── app.js                  # 所有业务逻辑、路由、数据存储
│       └── test.html               # 调试测试页
│
└── android_workbench/              # ===== Android 手机版 =====
    ├── version.properties          # 版本号管理（每次构建自动 +0.1）
    ├── build.gradle                # 根构建配置
    ├── gradle.properties           # Gradle 配置（SDK路径、JDK等）
    ├── .radlew.bat                 # 构建脚本
    ├── gradlew.bat                 # Gradle Wrapper（Windows）
    ├── backup/                     # 历史版本 APK 备份（自动创建）
    ├── app/
    │   ├── build.gradle            # APK 打包配置（文件名、版本号）
    │   ├── src/main/
    │   │   ├── AndroidManifest.xml # 应用清单（权限、启动页）
    │   │   ├── res/                # 原生资源（图标、strings.xml）
    │   │   ├── java/.../MainActivity.kt  # WebView 容器（Kotlin）
    │   │   └── assets/www/         # ===== Web 源代码（和PC版类似）=====
    │   │       ├── index.html      # 手机端页面结构（含底部导航）
    │   │       ├── styles.css      # 手机端样式（含响应式适配）
    │   │       ├── app.js          # 手机端业务逻辑
    │   │       └── test.html
    │   └── build/outputs/apk/debug/
    │       └── 个人工作台_vX.X.X_debug.apk  # 生成的 APK 文件
    └── ...
```

---

## 源代码说明

### 核心文件说明

| 文件 | 作用 | 何时需要修改 |
|------|------|-------------|
| `index.html` | 页面 DOM 结构、导航栏、底部导航（手机端） | 增删页面、调整布局结构 |
| `styles.css` | 所有 UI 样式（颜色、布局、动画） | 修改颜色主题、卡片样式、字体大小等 |
| `app.js` | 所有业务逻辑（路由、数据、渲染、AI调用） | 添加功能、修改逻辑、调整交互行为 |
| `main.js` (PC) | Electron 主进程（创建窗口） | 修改窗口大小、图标、菜单等 |
| `MainActivity.kt` (Android) | WebView 容器代码 | 配置 WebView 参数、权限处理 |

### 数据存储

- **PC版**：优先使用 IndexedDB v3（`aiConvs` / `aiMsgs`），fallback 到 `localStorage`
- **Android版**：强制使用 `localStorage`（WebView file:// 协议 IndexedDB 有兼容问题）
- **配置存储（Global）**：`localStorage` 键 `personal_app_config` 或 `global`
- **个人资料**：`localStorage` 键 `personal_profile`

---

## 开发环境准备

### 必需软件

| 软件 | 版本要求 | 用途 | 下载 |
|------|---------|------|------|
| **Node.js** | ≥ 18.x | PC版打包工具（asar） | https://nodejs.org/ |
| **JDK** | 17.x（必需） | Android 构建 | Android Studio 自带 |
| **Android Studio** | 最新版 | Android SDK / AVD 调试 | https://developer.android.com/studio |
| **Android SDK** | Platform 35 | 编译目标 | SDK Manager 内安装 |
| **Git** | 任意 | 版本控制 | https://git-scm.com/ |

### 环境变量检查

```powershell
# 验证 Node
node --version      # → v24.x 或更高

# 验证 Java（JDK 17）
java -version       # → openjdk 17.x

# 验证 Git
git --version
```

### Android SDK 配置（首次）

1. 打开 Android Studio → More Actions → SDK Manager
2. 勾选 **Android 15 (API 35)** → Apply
3. 左侧 SDK Tools → 勾选 **Android SDK Build-Tools 35** → Apply
4. 记录 Android SDK 路径（如 `C:\Users\你的用户名\AppData\Local\Android\Sdk`）

---

## PC版（Windows EXE）开发与打包

### 1. 源代码位置

所有修改都在 `个人工作台/源代码/` 目录：
```
个人工作台/源代码/
├── index.html    ← 页面结构
├── styles.css    ← UI 样式
├── app.js        ← 业务逻辑
├── main.js       ← Electron 主进程
└── package.json
```

### 2. 本地预览调试

```powershell
cd "d:\java编程文件夹\Project02\个人工作台\源代码"

# 方式一：直接用浏览器打开 index.html（纯前端，无需启动服务器）
# 双击 index.html 即可

# 方式二：用 Electron 运行（模拟真实窗口环境）
# 先安装 Electron
npm install -g electron

# 在源代码目录运行
electron .
```

### 3. 打包生成 EXE

本项目使用 **asar + Electron 预编译运行时**（已包含在 `个人工作台/` 目录），无需下载 electron-builder。

```powershell
# 步骤 1：复制最新源代码到 resources/app
Copy-Item "个人工作台\源代码\*" "个人工作台\resources\app\" -Force

# 步骤 2：全局安装 asar 打包工具（只需一次）
npm install -g @electron/asar

# 步骤 3：将 app 目录打包为 app.asar
cd "个人工作台\resources"
npx asar pack app app.asar

# 步骤 4：删除未打包的 app 目录（减小体积，可选）
Remove-Item -Recurse -Force "app"
```

完成后目录结构：
```
个人工作台/
├── 个人工作台.exe    ← 直接双击运行
└── resources/
    └── app.asar      ← 打包后的应用代码
```

**注意**：也可以保留 `resources/app` 目录（不打包），方便调试修改，无需重新打包。

---

## Android版（APK）开发与打包

### 1. 源代码位置

所有 Web 代码修改都在 `android_workbench/app/src/main/assets/www/`：
```
android_workbench/app/src/main/assets/www/
├── index.html    ← 手机端页面结构（含底部导航栏）
├── styles.css    ← 手机端样式（含 768px 以下响应式）
└── app.js        ← 业务逻辑（含 localStorage 强制适配）
```

### 2. 本地预览调试

```powershell
# 直接双击 index.html，然后用浏览器开发者工具切换到手机模式（F12 → 设备图标）
# 或用 adb 连接手机调试 WebView
```

### 3. 生成签名 APK（Debug 版）

使用项目自带的 Gradle Wrapper，**不需要**全局安装 Gradle。

```powershell
cd "d:\java编程文件夹\Project02\android_workbench"

# 方式一：使用推荐脚本（含版本号自动递增 + 备份）
.\.radlew.bat assembleDebug

# 方式二：直接使用 gradlew（推荐）
.\gradlew.bat assembleDebug
```

**构建成功后：**
```
✅ 自动备份上一版 APK →  android_workbench/backup/个人工作台_vX.X.X_debug.apk
✅ 新版 APK 输出路径 →  android_workbench/app/build/outputs/apk/debug/个人工作台_vX.X.X_debug.apk
✅ 版本号自动 +0.1  →  version.properties (例如 1.12.0 → 1.13.0)
✅ 应用名自动更新  →  个人工作台 v1.12.0（手机桌面显示）
```

### 4. 自定义应用图标和名称

**修改应用名（手机桌面显示）**：
- 构建时自动根据 `version.properties` 的 `versionName` 生成
- 格式：`个人工作台 vX.X.X`

**修改应用图标**：
1. 准备图标文件（推荐 512x512 PNG）
2. 使用 Android Studio → File → New → Image Asset
3. 选择图标文件 → Next → Finish
4. 会自动生成各分辨率的 mipmap 文件

**修改版本号**：
- 直接编辑 `android_workbench/version.properties`
- `versionName=1.0.0`（显示版本，支持小数递增）
- `versionCode=1`（内部版本，整数递增）

### 5. 手机端响应式适配说明

Android 版样式在 768px 宽度以下自动切换：
- 隐藏侧边导航栏，显示**底部导航栏**（首页/计划/AI/我的/设置）
- 卡片和网格改为单列布局
- 弹窗改为全屏自适应（左右各 12px 边距）
- AI 对话列表改成横向滚动
- 表格、计时器、饮食汇总自动适配

CSS 断点位置：`styles.css` 中的 `@media (max-width: 768px)`

---

## 安装与使用

### PC版安装

无需安装，**绿色免安装**：
1. 将整个 `个人工作台/` 文件夹复制到电脑任意位置
2. 双击 `个人工作台.exe` 即可启动
3. 右键 → 发送到 → 桌面快捷方式，方便快速启动

### Android版安装

1. 将 `个人工作台_vX.X.X_debug.apk` 传到手机（QQ/微信/U盘/ADB）
2. 手机设置 → 允许未知来源安装应用
3. 点击 APK 文件 → 安装
4. 如已安装旧版本，请先**卸载旧版本**再安装新版本，避免签名冲突

### ADB 快速安装（开发调试用）

```powershell
# 手机开启 USB 调试并连接电脑
adb install -r "d:\java编程文件夹\Project02\android_workbench\app\build\outputs\apk\debug\个人工作台_vX.X.X_debug.apk"
```

---

## AI对话功能配置

### 支持的 AI 提供商

| 提供商 | 默认模型 | API 端点 | API Key 格式 |
|--------|---------|---------|-------------|
| 🟢 **豆包**（默认） | `doubao-seed-evolving` | `https://ark.cn-beijing.volces.com/api/v3/chat/completions` | `ark-xxxxxxxxxxxxxxxxxxxx-xxxxx` |
| 🔵 DeepSeek | `deepseek-chat` | `https://api.deepseek.com/v1/chat/completions` | `sk-xxxxxxxxxx` |
| 🟡 通义千问 | `qwen-turbo` | 自定义 | `sk-xxxxxxxxxx` |
| 🟤 百度千帆 | `ERNIE-Bot` | 自定义 | `API Key + Secret Key` |
| ⚪ 自定义 | - | 自定义 URL | 自定义 |

### 配置步骤（PC & Android 相同）

1. 打开应用 → 底部导航 **「我的」** / 侧边栏 **「数据与设置」**
2. 找到 **「AI 对话配置」** 区域
3. 填写：
   - **提供商**：选择豆包/DeepSeek/自定义
   - **API Key**：粘贴你的 Key（密码模式，安全存储）
   - **模型**：选择或输入模型名
   - **自定义 API URL**：自定义提供商时填写
   - **系统提示词**：AI 人设（可选，有默认）
4. 点击 **「保存 AI 配置」**
5. 点击 **「测试连接」** 验证是否成功

### 获取豆包 API Key

1. 访问 [火山引擎方舟平台](https://console.volcengine.com/ark)
2. 注册登录 → 进入「模型推理」→「API Key 管理」
3. 创建 API Key → 复制（格式 `ark-xxxxxx-xxxx`）
4. 在应用设置中粘贴并保存

---

## 常见问题（FAQ）

### Q1: 修改了 styles.css / app.js 后 EXE 里没有生效？
**A**：EXE 用的是 `resources/app.asar` 中的代码。修改源代码后需要重新打包：
```powershell
Copy-Item "源代码\*" "resources\app\" -Force
cd resources; npx asar pack app app.asar
```
或者直接保留 `resources/app` 目录（不打包为 asar），每次修改直接生效。

### Q2: Android 手机端无法保存数据？
**A**：Android WebView 在 `file://` 协议下 IndexedDB 不可用，已在代码中强制 fallback 到 `localStorage`。如果仍报错，请卸载旧 APK 重新安装最新版。

### Q3: 构建 APK 时报错 `Failed to find Platform SDK with path: platforms;android-37`？
**A**：SDK 版本不匹配。打开 SDK Manager 安装 Android 35，或修改 `app/build.gradle` 中的 `compileSdkVersion 35`。

### Q4: 构建时报错 `项目路径包含非ASCII字符`？
**A**：已修复。`gradle.properties` 中已添加 `android.overridePathCheck=true`。

### Q5: AI 对话返回 401 / 404 错误？
**A**：
- 401 = API Key 格式错误或无效。豆包需要 `ark-` 开头的 UUID 格式，不是 `sk-`。
- 404 = 模型名不存在。当前默认 `doubao-seed-evolving`，可在设置中切换模型。
- 启动时会自动清洗 `localStorage` 中的无效配置，重启应用即可。

### Q6: 日期保存失败，提示 `Invalid time value`？
**A**：Android WebView 对 ISO 8601 日期格式有兼容问题。代码中已使用 `U.parseDate()` 和 `U.toISO()` 工具函数处理，确保版本 ≥ v1.6.0 即可。

### Q7: 如何备份和恢复数据？
**A**：打开「个人中心」→ 「数据备份/恢复」：
- **导出数据**：导出 JSON 文件到本地
- **导入数据**：从 JSON 文件恢复
- **一键备份**：备份到 `localStorage`
- **恢复备份**：从 `localStorage` 备份恢复
- **重置所有数据**：清空所有内容（谨慎使用）

### Q8: Gradle 下载太慢？
**A**：已配置腾讯镜像。如果还是慢：
1. 手动下载 Gradle 9.5.0：https://mirrors.cloud.tencent.com/gradle/gradle-9.5.0-all.zip
2. 放到 `C:\Users\你的用户名\.gradle\wrapper\dists\gradle-9.5.0-all\` 下的随机文件夹中
3. 重新运行 `.\gradlew.bat assembleDebug`

---

## 技术栈

| 层级 | 技术 |
|------|------|
| **前端 UI** | 纯 HTML5 + CSS3 + 原生 JavaScript（无框架依赖） |
| **数据存储** | IndexedDB v3 / Web Storage (localStorage) |
| **PC 桌面** | Electron（窗口容器，无需 Node API） |
| **Android 容器** | 原生 WebView + Kotlin（仅加载本地 HTML） |
| **UI 设计** | 现代卡片式 + 蓝紫渐变主题 + 响应式布局 |
| **构建工具** | Gradle 9.5.0 (Android) / asar (PC) |
| **JDK 版本** | 17 (Android 构建必须) |

---

## 开源协议

MIT License - 欢迎自由使用、修改、分发。

---

## 更新日志

| 版本 | 说明 |
|------|------|
| v1.13.0 | UI 全面现代化升级，卡片式设计，渐变主题，PC/Android 同步 |
| v1.12.0 | AI 对话配置固定化，优化手机端数据保存 |
| v1.9.0  | 新增个人中心页面（PC + Android），数据导出/导入/备份 |
| v1.7.0  | AI 对话功能迁移到 Android，默认豆包提供商 |
| v1.0.0  | 初始版本 |

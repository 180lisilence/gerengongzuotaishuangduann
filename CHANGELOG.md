# 个人工作台 · 变更日志

> **规范**：每次代码变更前自动备份源代码至 `源代码_backup_YYYYMMDD_HHMMSS/`，并在此文件追加变更记录。

---

## [2026-08-15 下午] Bug 修复 + EXE 重打包 + GitHub/Android 同步

**修复**：个人中心「编辑资料」保存崩溃（`Cannot read properties of null (reading 'value')`）
- 根因：`showEditDialog()` 中 `document.querySelector('.modal-backdrop')` 全局查找命中了 index.html 里预先存在的空容器（`#modal-backdrop`），而非新建的带表单的弹窗
- 修复：改用闭包变量 `modal.querySelector(...)`

**新 EXE**：`d:\java编程文件夹\Project02\个人工作台_v2\个人工作台.exe`
- 原 EXE 目录的 app.asar 被 Windows 内核级锁住（进程已关但句柄残留），无法覆盖
- 解决方案：复制整个 EXE 目录为独立副本 `个人工作台_v2\`，在副本中用 asar v3 `createPackage` API 重新打包

**同步清单**：
| 位置 | 状态 |
|------|------|
| `个人工作台\源代码\` (工作副本) | ✅ 已修复 |
| `个人工作台_v2\` (新 EXE) | ✅ 重新打包 app.asar |
| `GitHub上传版\个人工作台\源代码\` | ✅ 同步完成 |
| `GitHub上传版\android_workbench\assets\www\` | ✅ 同步完成 |
| `android_workbench\assets\www\` (构建目录) | ✅ 同步完成 |

**备份目录**：
- `源代码_backup_20260815_130004`（源代码最新备份）
- `GitHub上传版_backup_20260815_130131`（GitHub 仓库备份）
- `个人工作台\resources\app.asar.bak_20260815_130547`（旧 asar 备份）

---

## [2026-08-15] AI 对话 UI 大改造 · 主题自选 · 头像自选

**备份目录**：`源代码_backup_20260815_130004`
**改动文件**：`app.js`（~600 行新增）、`styles.css`（~200 行改动/新增）

### ✨ 新增功能

1. **AI 主题色系统**（CSS 变量驱动）
   - 预设 5 套配色：柔和米色（默认）/ 暖黄活力 / 薄荷清新 / 樱花浪漫 / 薰衣草紫
   - 自选取色器：点击彩虹按钮弹出系统取色器，自动根据主色生成完整主题明暗层次
   - 持久化：`localStorage.ai_theme_key` / `ai_theme_vars`
   - 覆盖元素：悬浮球、快捷面板头部、聊天气泡、头像、引导按钮、输入框

2. **AI 头像自选**（emoji 库 + 图片上传）
   - AI 头像库：🤖🐱🐰🐻🐼🦊🐨🐯🐸🦄🐙🦋🌈⭐🌟💫（16 个）
   - 用户头像库：👤🧑👨👩🧒👦👧🧑‍💻🧑‍🎨🧑‍🚀🧑‍🏫🧑‍🍳🦸🧙🧚😎（16 个）
   - 上传图片：本地图片转 base64 存 localStorage
   - 清除图片：一键回退到 emoji
   - 持久化：`localStorage.ai_avatar`
   - 聊天气泡头像实时同步更新

3. **Markdown 渲染**（AI 消息支持）
   - 表格：`| 列1 | 列2 |` 语法 → 结构化卡片
   - 代码块：```` ```code``` ```` → 深色 pre
   - 行内代码：`` `code` `` → 高亮 code
   - 加粗：`**文字**` → 紫色 span.md-strong
   - 列表：`- 项` / `* 项` → ul.md-list
   - 三级标题：`### 标题` → div.md-h3

### 🎨 UI 风格（参考番茄计划截图）

| 元素 | 旧 | 新 |
|------|----|----|
| 用户气泡 | 蓝紫渐变 + 白字 | 柔和米色渐变 + 米褐字 |
| AI 气泡 | 浅色卡片 + 边框 | 纯白卡片 + 柔和阴影 |
| 头部 | 蓝紫渐变 | 粉/绿暖渐变（随主题变） |
| 悬浮球 | 蓝紫渐变 | 随主题变 |
| 引导按钮 | 无 | 暖色调圆角按钮（点击直接发送） |
| 欢迎卡片 | 蓝紫横幅 | 纯白卡片 + 引导按钮 + 主题色区 + 头像区 |

### 🐛 Bug 修复

- **个人中心「编辑资料」崩溃**：`showEditDialog()` 里用 `document.querySelector('.modal-backdrop')` 全局查找，但 index.html 里本来就有一个空的 `.modal-backdrop` 容器，导致找到空壳 → `nickInput.value` 报 null 崩溃。修复：改用闭包变量 `modal.querySelector(...)`。
- **简单 Markdown 渲染**：`\n` 在 split 后再 replace `/\n/g` 是多余操作（split 已经去掉了换行），但不影响结果。

### 🔧 实现要点

- 主题用 CSS 变量 + JS 读写 `document.documentElement.style.setProperty()`，**运行时切换零延迟**
- 自定义主题通过 `AI_themeFromColor(hex)` 从单一主色自动推导明暗色（lighten/darken + rgba）
- 头像图片用 `FileReader.readAsDataURL` 转 base64，直接存 localStorage，无外部文件依赖
- 头像选择器分左右布局：左侧「当前」预览 + 上传/清除按钮，右侧 emoji 网格（8 列）

---

## [历史版本] 之前的功能（未记录详细变更）

- 首页总览、今日计划、自媒体、开发工作、咨询工作、健身计划、饮食计划、游戏娱乐
- AI 对话（豆包/DeepSeek/通义/千帆 + 自定义）
- 个人中心（昵称、头像、简介、统计、数据导出/导入/重置）
- IndexedDB v3 + localStorage 后备存储
- Electron 桌面应用打包
- Android APK 打包（WebView）

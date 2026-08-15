# 个人工作台 APK 构建说明

## 前置条件检查清单

在开始之前，请确保已安装：

- [x] **JDK 17** （已安装：Java 17.0.19）
- [ ] **Android SDK** （需要安装）
- [ ] **Android SDK Platform 34**
- [ ] **Android SDK Build-Tools 34**
- [ ] **Android SDK Platform-Tools**

---

## 步骤一：安装 Android SDK

### 方式 A：使用 Android Studio（推荐）

1. 下载 Android Studio：https://developer.android.com/studio
2. 安装后打开，进入 **More Actions → SDK Manager**
3. 在 **SDK Platforms** 标签页：
   - 勾选 **Android 14 (API 34)**
4. 在 **SDK Tools** 标签页：
   - 勾选 **Android SDK Build-Tools 34.0.0**
   - 勾选 **Android SDK Platform-Tools**
   - 勾选 **Android SDK Command-line Tools**
5. 点击 **Apply** 下载安装

### 方式 B：仅安装命令行工具（更轻量）

1. 下载 Command-line Tools：https://developer.android.com/studio#command-tools
2. 解压到：`C:\Android\cmdline-tools\latest\`
3. 打开 PowerShell，执行：
   ```powershell
   # 设置环境变量
   $env:ANDROID_HOME = "C:\Android"
   
   # 安装必要的 SDK 组件
   C:\Android\cmdline-tools\latest\bin\sdkmanager.bat "platforms;android-34"
   C:\Android\cmdline-tools\latest\bin\sdkmanager.bat "build-tools;34.0.0"
   C:\Android\cmdline-tools\latest\bin\sdkmanager.bat "platform-tools"
   ```

---

## 步骤二：配置 SDK 路径

编辑项目中的 `local.properties` 文件，设置正确的 SDK 路径：

```properties
# 如果使用 Android Studio 默认安装路径
sdk.dir=C:\\Users\\你的用户名\\AppData\\Local\\Android\\Sdk

# 如果使用命令行工具方式
sdk.dir=C:\\Android
```

---

## 步骤三：构建 APK

### 重要：PowerShell 命令格式

在 PowerShell 中执行当前目录的脚本，必须使用 `.\` 前缀：

```powershell
# ✅ 正确
.\gradlew.bat assembleDebug

# ❌ 错误
gradlew.bat assembleDebug
```

### 构建 Debug 版本

```powershell
cd d:\java编程文件夹\Project02\android_workbench
.\gradlew.bat assembleDebug
```

构建成功后，APK 文件位置：
```
app\build\outputs\apk\debug\app-debug.apk
```

### 构建 Release 版本

```powershell
.\gradlew.bat assembleRelease
```

构建成功后，APK 文件位置：
```
app\build\outputs\apk\release\app-release-unsigned.apk
```

### 一键构建

直接双击 `build_apk.bat` 文件即可自动完成构建。

---

## 步骤四：安装到手机

### 方法 A：USB 数据线

1. 手机开启 **开发者选项** 和 **USB 调试**
2. 连接电脑，选择 **文件传输** 模式
3. 将 `app-debug.apk` 复制到手机
4. 在手机文件管理器中点击安装

### 方法 B：ADB 命令

```powershell
# 使用 ADB 安装（需要 platform-tools）
C:\Users\你的用户名\AppData\Local\Android\Sdk\platform-tools\adb.exe install app\build\outputs\apk\debug\app-debug.apk
```

### 方法 C：扫码安装

1. 将 APK 上传到网盘
2. 手机扫码下载安装

---

## 常见问题

### Q: 构建时下载依赖很慢？

可以配置国内镜像，在 `settings.gradle` 中添加：

```groovy
dependencyResolutionManagement {
    repositories {
        maven { url 'https://maven.aliyun.com/repository/google' }
        maven { url 'https://maven.aliyun.com/repository/public' }
        google()
        mavenCentral()
    }
}
```

### Q: 提示 "SDK location not found"？

确保 `local.properties` 中的 `sdk.dir` 路径正确存在。

### Q: 提示 "compileSdkVersion is not specified"？

这是因为 Android SDK Platform 未安装，请使用 SDK Manager 安装 API 34。

### Q: 应用打开白屏？

可能是 WebView 加载本地文件失败。检查：
1. `assets/www/index.html` 是否存在
2. `MainActivity.kt` 中的 `loadUrl` 路径是否正确

---

## 项目结构说明

```
android_workbench/
├── app/src/main/
│   ├── assets/www/
│   │   ├── index.html      # 主页面
│   │   ├── app.js          # 业务逻辑
│   │   ├── styles.css      # 样式表
│   │   └── test.html       # 测试页面
│   ├── java/com/personal/workbench/
│   │   └── MainActivity.kt # WebView 容器
│   ├── res/                # Android 资源（图标、主题等）
│   └── AndroidManifest.xml
├── gradle/wrapper/         # Gradle Wrapper
├── build_apk.bat           # 一键构建脚本
├── gradlew.bat             # Gradle 启动脚本
├── local.properties        # SDK 路径配置（需修改）
├── build.gradle            # 项目级构建配置
├── settings.gradle         # 项目设置
└── gradle.properties       # Gradle 属性配置
```

---

## 高级选项

### 签名 Release APK

创建签名密钥（仅首次）：
```powershell
keytool -genkey -v -keystore release-key.jks -keyalg RSA -keysize 2048 -validity 10000 -alias release
```

在 `app/build.gradle` 中添加签名配置。

### 修改应用名称

编辑 `app/src/main/res/values/strings.xml`：
```xml
<string name="app_name">你的应用名称</string>
```

### 修改应用图标

替换 `app/src/main/res/` 下的图标文件（需要自适应图标）。

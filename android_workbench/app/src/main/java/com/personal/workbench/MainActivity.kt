package com.personal.workbench

import android.os.Bundle
import android.view.WindowManager
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity

class MainActivity : AppCompatActivity() {
    private lateinit var webView: WebView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        // 隐藏状态栏，全屏显示
        window.setFlags(
            WindowManager.LayoutParams.FLAG_FULLSCREEN,
            WindowManager.LayoutParams.FLAG_FULLSCREEN
        )
        
        webView = WebView(this)
        setContentView(webView)
        
        setupWebView()
    }
    
    private fun setupWebView() {
        val settings = webView.settings
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.databaseEnabled = true
        settings.useWideViewPort = true
        settings.loadWithOverviewMode = true
        settings.setSupportZoom(false)
        settings.builtInZoomControls = false
        settings.displayZoomControls = false
        settings.setSupportMultipleWindows(false)
        settings.cacheMode = WebSettings.LOAD_DEFAULT
        settings.mediaPlaybackRequiresUserGesture = false
        settings.allowFileAccess = true
        settings.allowContentAccess = true
        settings.mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
        settings.userAgentString = settings.userAgentString + " PersonalWorkbench/Android"

        // IndexedDB 在 file:// 协议下需要这些配置
        settings.setAllowFileAccessFromFileURLs(true)
        settings.setAllowUniversalAccessFromFileURLs(true)

        // 设置数据库路径，确保 IndexedDB 可写
        val dbPath = getDir("databases", MODE_PRIVATE).absolutePath
        settings.databasePath = dbPath

        webView.webViewClient = WebViewClient()
        webView.webChromeClient = WebChromeClient()

        // 加载本地 HTML 文件
        webView.loadUrl("file:///android_asset/www/index.html")
    }
    
    override fun onResume() {
        super.onResume()
        webView.onResume()
        webView.resumeTimers()
    }
    
    override fun onPause() {
        super.onPause()
        webView.onPause()
        webView.pauseTimers()
    }
    
    override fun onDestroy() {
        webView.stopLoading()
        webView.settings.javaScriptEnabled = false
        webView.clearHistory()
        webView.removeAllViews()
        (webView.parent as? android.view.ViewGroup)?.removeView(webView)
        webView.destroy()
        super.onDestroy()
    }
    
    override fun onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack()
        } else {
            super.onBackPressed()
        }
    }
}

package com.tarotai.mobile

import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import android.webkit.CookieManager
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.Toast
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat

class MainActivity : Activity() {
    private lateinit var webView: WebView
    private val appUrl = "https://tarotai-core.vercel.app"
    private val allowedHost = "tarotai-core.vercel.app"

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.statusBarColor = Color.rgb(7, 10, 15)
        window.navigationBarColor = Color.rgb(7, 10, 15)
        WindowCompat.setDecorFitsSystemWindows(window, false)

        val root = FrameLayout(this)
        webView = WebView(this)
        root.addView(
            webView,
            FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
            )
        )
        ViewCompat.setOnApplyWindowInsetsListener(root) { view, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            insets
        }
        setContentView(root)

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            allowFileAccess = false
            allowContentAccess = false
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            javaScriptCanOpenWindowsAutomatically = false
            setSupportMultipleWindows(false)
            safeBrowsingEnabled = true
        }

        CookieManager.getInstance().setAcceptCookie(true)
        webView.webChromeClient = WebChromeClient()
        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(
                view: WebView?,
                request: WebResourceRequest
            ): Boolean {
                val uri = request.url
                if (uri.scheme == "https" && uri.host.equals(allowedHost, ignoreCase = true)) {
                    return false
                }
                if (uri.scheme == "https" || uri.scheme == "http") {
                    return try {
                        startActivity(Intent(Intent.ACTION_VIEW, uri))
                        true
                    } catch (_: Exception) {
                        true
                    }
                }
                return true
            }

            override fun onReceivedError(
                view: WebView?,
                request: WebResourceRequest,
                error: WebResourceError
            ) {
                if (request.isForMainFrame) {
                    Toast.makeText(
                        this@MainActivity,
                        "TarotAI could not load. Check your internet connection and try again.",
                        Toast.LENGTH_LONG
                    ).show()
                }
            }
        }

        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState)
        } else {
            webView.loadUrl(appUrl)
        }
    }

    @Deprecated("Deprecated by Android in favour of predictive back handling")
    override fun onBackPressed() {
        if (::webView.isInitialized && webView.canGoBack()) {
            webView.goBack()
        } else {
            super.onBackPressed()
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        if (::webView.isInitialized) {
            webView.saveState(outState)
        }
        super.onSaveInstanceState(outState)
    }

    override fun onDestroy() {
        if (::webView.isInitialized) {
            webView.stopLoading()
            webView.destroy()
        }
        super.onDestroy()
    }
}

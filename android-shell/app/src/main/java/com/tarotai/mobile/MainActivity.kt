package com.tarotai.mobile

import android.app.Activity
import android.app.DownloadManager
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.Uri
import android.os.Bundle
import android.webkit.CookieManager
import android.webkit.DownloadListener
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.webkit.URLUtil
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import android.view.Gravity
import android.view.View
import android.widget.Toast
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat

class MainActivity : Activity() {
    private lateinit var webView: WebView
    private lateinit var pageProgress: ProgressBar
    private lateinit var statusPanel: LinearLayout
    private lateinit var statusSpinner: ProgressBar
    private lateinit var statusTitle: TextView
    private lateinit var statusMessage: TextView
    private lateinit var retryButton: Button

    private val appUrl = "https://tarotai-core.vercel.app"
    private val allowedHost = "tarotai-core.vercel.app"
    private var initialLoadPending = true
    private var mainFrameFailed = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.statusBarColor = Color.rgb(7, 10, 15)
        window.navigationBarColor = Color.rgb(7, 10, 15)
        WindowCompat.setDecorFitsSystemWindows(window, false)

        val root = FrameLayout(this).apply {
            setBackgroundColor(Color.rgb(7, 10, 15))
        }
        webView = WebView(this)
        root.addView(webView, FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.MATCH_PARENT
        ))

        pageProgress = ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply {
            max = 100
            progress = 0
            isIndeterminate = false
            visibility = View.GONE
            progressTintList = android.content.res.ColorStateList.valueOf(Color.rgb(114, 230, 176))
            progressBackgroundTintList = android.content.res.ColorStateList.valueOf(Color.rgb(28, 39, 51))
        }
        root.addView(pageProgress, FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            dp(3),
            Gravity.TOP
        ))

        statusPanel = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setPadding(dp(28), dp(28), dp(28), dp(28))
            setBackgroundColor(Color.rgb(7, 10, 15))
        }
        statusSpinner = ProgressBar(this).apply { isIndeterminate = true }
        statusPanel.addView(statusSpinner, LinearLayout.LayoutParams(dp(38), dp(38)).apply {
            gravity = Gravity.CENTER_HORIZONTAL
            bottomMargin = dp(20)
        })
        statusTitle = TextView(this).apply {
            text = "Opening TarotAI"
            textSize = 22f
            setTypeface(typeface, Typeface.BOLD)
            setTextColor(Color.rgb(237, 242, 247))
            gravity = Gravity.CENTER
        }
        statusPanel.addView(statusTitle, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        ))
        statusMessage = TextView(this).apply {
            text = "Securely connecting to your workspace…"
            textSize = 14f
            setTextColor(Color.rgb(142, 154, 170))
            gravity = Gravity.CENTER
        }
        statusPanel.addView(statusMessage, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        ).apply {
            topMargin = dp(10)
        })
        retryButton = Button(this).apply {
            text = "Try again"
            visibility = View.GONE
            setTextColor(Color.rgb(6, 16, 24))
            backgroundTintList = android.content.res.ColorStateList.valueOf(Color.rgb(114, 230, 176))
            setOnClickListener {
                initialLoadPending = true
                loadApp()
            }
        }
        statusPanel.addView(retryButton, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        ).apply {
            gravity = Gravity.CENTER_HORIZONTAL
            topMargin = dp(18)
        })
        root.addView(statusPanel, FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.MATCH_PARENT
        ))

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
        webView.webChromeClient = object : WebChromeClient() {
            override fun onProgressChanged(view: WebView?, newProgress: Int) {
                pageProgress.progress = newProgress
                pageProgress.visibility = if (newProgress in 1..99) View.VISIBLE else View.GONE
            }
        }
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
                        Toast.makeText(this@MainActivity, "No app is available to open this link.", Toast.LENGTH_SHORT).show()
                        true
                    }
                }
                return true
            }

            override fun onPageStarted(view: WebView?, url: String?, favicon: android.graphics.Bitmap?) {
                mainFrameFailed = false
                pageProgress.progress = 0
                pageProgress.visibility = View.VISIBLE
                if (initialLoadPending) showLoading()
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                if (mainFrameFailed) return
                initialLoadPending = false
                pageProgress.visibility = View.GONE
                statusPanel.visibility = View.GONE
            }

            override fun onReceivedError(
                view: WebView?,
                request: WebResourceRequest,
                error: WebResourceError
            ) {
                if (request.isForMainFrame) {
                    mainFrameFailed = true
                    initialLoadPending = false
                    showError(
                        "TarotAI couldn't load",
                        if (hasValidatedNetwork()) {
                            "The service may be temporarily unavailable. Check your connection and try again."
                        } else {
                            "Your device appears to be offline. Reconnect to the internet and try again."
                        }
                    )
                }
            }

            override fun onReceivedHttpError(
                view: WebView?,
                request: WebResourceRequest,
                errorResponse: android.webkit.WebResourceResponse
            ) {
                if (request.isForMainFrame && errorResponse.statusCode >= 500) {
                    mainFrameFailed = true
                    initialLoadPending = false
                    showError(
                        "TarotAI is temporarily unavailable",
                        "The server returned an error. Your account and trading settings have not been changed by this screen."
                    )
                }
            }
        }

        webView.setDownloadListener(DownloadListener { url, userAgent, contentDisposition, mimeType, _ ->
            startTrustedDownload(url, userAgent, contentDisposition, mimeType)
        })

        if (savedInstanceState != null && webView.restoreState(savedInstanceState) != null) {
            initialLoadPending = false
            statusPanel.visibility = View.GONE
        } else {
            loadApp()
        }
    }

    private fun loadApp() {
        mainFrameFailed = false
        initialLoadPending = true
        if (!hasValidatedNetwork()) {
            showError(
                "You're offline",
                "Connect to the internet, then tap Try again. TarotAI needs a secure connection to load your workspace."
            )
            return
        }
        showLoading()
        webView.loadUrl(appUrl)
    }

    private fun showLoading() {
        statusSpinner.visibility = View.VISIBLE
        statusTitle.text = "Opening TarotAI"
        statusMessage.text = "Securely connecting to your workspace…"
        retryButton.visibility = View.GONE
        statusPanel.visibility = View.VISIBLE
    }

    private fun showError(title: String, message: String) {
        statusSpinner.visibility = View.GONE
        statusTitle.text = title
        statusMessage.text = message
        retryButton.visibility = View.VISIBLE
        statusPanel.visibility = View.VISIBLE
        pageProgress.visibility = View.GONE
    }

    private fun hasValidatedNetwork(): Boolean {
        val manager = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val network = manager.activeNetwork ?: return false
        val capabilities = manager.getNetworkCapabilities(network) ?: return false
        return capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) &&
            capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
    }

    private fun startTrustedDownload(
        url: String,
        userAgent: String?,
        contentDisposition: String?,
        mimeType: String?
    ) {
        try {
            val uri = Uri.parse(url)
            if (uri.scheme != "https" || !uri.host.equals(allowedHost, ignoreCase = true)) {
                Toast.makeText(this, "For safety, only HTTPS downloads from the official TarotAI domain are allowed inside the app.", Toast.LENGTH_LONG).show()
                return
            }
            val manager = getSystemService(DownloadManager::class.java)
            val filename = URLUtil.guessFileName(url, contentDisposition, mimeType)
                .replace(Regex("[^A-Za-z0-9._-]"), "_")
                .take(120)
                .ifBlank { "TarotAI-download.apk" }
            val request = DownloadManager.Request(uri).apply {
                setTitle(filename)
                setDescription("Downloading from the official TarotAI website")
                setMimeType(mimeType ?: "application/vnd.android.package-archive")
                setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                setAllowedOverMetered(true)
                setAllowedOverRoaming(false)
                val cookie = CookieManager.getInstance().getCookie(url)
                if (!cookie.isNullOrBlank()) addRequestHeader("Cookie", cookie)
                if (!userAgent.isNullOrBlank()) addRequestHeader("User-Agent", userAgent)
            }
            manager.enqueue(request)
            Toast.makeText(this, "Download started. Check your notifications for progress.", Toast.LENGTH_LONG).show()
        } catch (_: Exception) {
            Toast.makeText(this, "Could not start the download. Check storage and network access, then retry.", Toast.LENGTH_LONG).show()
        }
    }

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

    @Deprecated("Deprecated by Android in favour of predictive back handling")
    override fun onBackPressed() {
        if (::webView.isInitialized && webView.canGoBack()) {
            webView.goBack()
        } else {
            super.onBackPressed()
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        if (::webView.isInitialized) webView.saveState(outState)
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

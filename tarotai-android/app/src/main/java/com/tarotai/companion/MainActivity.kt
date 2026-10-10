package com.tarotai.companion

import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.provider.Settings
import android.view.ViewGroup
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast

class MainActivity : Activity() {
    private val ink = Color.rgb(20, 31, 45)
    private val muted = Color.rgb(98, 113, 132)
    private val mint = Color.rgb(35, 160, 113)
    private lateinit var status: TextView

    data class AppChoice(val name: String, val packageName: String)
    private val apps = listOf(
        AppChoice("Chrome", "com.android.chrome"),
        AppChoice("YouTube", "com.google.android.youtube"),
        AppChoice("Gmail", "com.google.android.gm"),
        AppChoice("WhatsApp", "com.whatsapp"),
        AppChoice("Google Maps", "com.google.android.apps.maps"),
        AppChoice("Settings", "com.android.settings"),
        AppChoice("Phone", "com.google.android.dialer")
    )

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        render()
    }
    override fun onResume() {
        super.onResume()
        if (::status.isInitialized) updateStatus()
    }
    private fun render() {
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(20), dp(22), dp(20), dp(24))
            setBackgroundColor(Color.rgb(246, 248, 251))
        }
        root.addView(TextView(this).apply {
            text = "tarotai"; textSize = 28f; setTextColor(ink); typeface = Typeface.DEFAULT_BOLD
        })
        root.addView(TextView(this).apply {
            text = "Your AI companion for Android"; textSize = 14f; setTextColor(muted)
            setPadding(0, dp(2), 0, dp(16))
        })
        val card = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(16), dp(14), dp(16), dp(14))
            background = rounded(Color.WHITE, 18)
        }
        card.addView(TextView(this).apply {
            text = "Device navigation"; textSize = 17f; setTextColor(ink); typeface = Typeface.DEFAULT_BOLD
        })
        status = TextView(this).apply {
            textSize = 13f; setTextColor(muted); setPadding(0, dp(8), 0, dp(10))
        }
        card.addView(status)
        card.addView(button("Enable navigation permission") {
            startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))
        })
        card.addView(TextView(this).apply {
            text = "Android asks you to enable this service manually. TarotAI does not enable it silently."
            textSize = 12f; setTextColor(muted); setPadding(0, dp(8), 0, dp(6))
        })
        val navRow = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        navRow.addView(button("Back") { runNav("Back") { it.navigateBack() } }, weightParams())
        navRow.addView(button("Home") { runNav("Home") { it.navigateHome() } }, weightParams())
        navRow.addView(button("Recents") { runNav("Recents") { it.showRecents() } }, weightParams())
        card.addView(navRow)
        root.addView(card, marginParams(top = 4, bottom = 18))
        root.addView(TextView(this).apply {
            text = "Open an app"; textSize = 18f; setTextColor(ink); typeface = Typeface.DEFAULT_BOLD
            setPadding(0, 0, 0, dp(8))
        })
        root.addView(TextView(this).apply {
            text = "Choose an app below. Only listed apps are offered by default."
            textSize = 13f; setTextColor(muted); setPadding(0, 0, 0, dp(10))
        })
        apps.forEach { choice ->
            root.addView(button("↗   " + choice.name) { launchApp(choice) }, marginParams(bottom = 8))
        }
        root.addView(TextView(this).apply {
            text = "Device control is local. Remote AI-driven automation is not connected yet. Every navigation action is initiated by you."
            textSize = 12f; setTextColor(muted); setPadding(0, dp(12), 0, 0)
        })
        setContentView(root)
        updateStatus()
    }
    private fun button(label: String, action: () -> Unit): Button =
        Button(this).apply {
            text = label; textSize = 13f; isAllCaps = false; setTextColor(ink)
            background = rounded(Color.WHITE, 12, Color.rgb(223, 229, 237))
            setPadding(dp(12), dp(8), dp(12), dp(8))
            setOnClickListener { action() }
        }
    private fun launchApp(choice: AppChoice) {
        val intent = packageManager.getLaunchIntentForPackage(choice.packageName)
        if (intent == null) {
            Toast.makeText(this, choice.name + " is not installed or cannot be opened.", Toast.LENGTH_SHORT).show()
            return
        }
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        startActivity(intent)
    }
    private fun runNav(label: String, action: (TarotAccessibilityService) -> Boolean) {
        val service = TarotAccessibilityService.active
        if (service == null) {
            Toast.makeText(this, "Enable TarotAI navigation permission first.", Toast.LENGTH_SHORT).show()
            startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))
            return
        }
        val ok = action(service)
        Toast.makeText(this, if (ok) label + " action sent" else label + " action unavailable", Toast.LENGTH_SHORT).show()
    }
    private fun updateStatus() {
        val enabled = TarotAccessibilityService.active != null
        status.text = if (enabled) "Navigation permission is enabled." else "Navigation permission is off."
        status.setTextColor(if (enabled) mint else muted)
    }
    private fun rounded(color: Int, radius: Int, stroke: Int? = null) = GradientDrawable().apply {
        setColor(color); cornerRadius = dp(radius).toFloat()
        if (stroke != null) setStroke(dp(1), stroke)
    }
    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()
    private fun marginParams(top: Int = 0, bottom: Int = 0) =
        LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
            topMargin = dp(top); bottomMargin = dp(bottom)
        }
    private fun weightParams() =
        LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply { marginEnd = dp(4) }
}

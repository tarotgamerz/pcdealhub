package com.tarotai.companion

import android.accessibilityservice.AccessibilityService
import android.view.accessibility.AccessibilityEvent

/** Navigation-only service. It never reads screen content or taps arbitrary controls. */
class TarotAccessibilityService : AccessibilityService() {
    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        // Intentionally no screen-content collection or transmission.
    }
    override fun onInterrupt() {}
    companion object {
        @Volatile var active: TarotAccessibilityService? = null
            private set
    }
    override fun onServiceConnected() {
        super.onServiceConnected()
        active = this
    }
    override fun onDestroy() {
        if (active === this) active = null
        super.onDestroy()
    }
    fun navigateBack(): Boolean = performGlobalAction(GLOBAL_ACTION_BACK)
    fun navigateHome(): Boolean = performGlobalAction(GLOBAL_ACTION_HOME)
    fun showRecents(): Boolean = performGlobalAction(GLOBAL_ACTION_RECENTS)
}

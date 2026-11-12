package com.examguard

import android.app.Activity
import android.app.ActivityManager
import android.content.Context
import android.hardware.display.DisplayManager
import android.os.Handler
import android.os.Looper
import android.view.View
import android.view.ViewTreeObserver
import expo.modules.core.interfaces.ExpoMethod
import expo.modules.core.interfaces.services.UIManager
import expo.modules.core.interfaces.services.UISettingsService
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ExamGuardModule(context: Context, uiManager: UIManager, settings: UISettingsService) : Module(context, uiManager, settings) {
  private val h = Handler(Looper.getMainLooper())
  private var running = false
  private var pinned = false
  private var lastMulti = false
  private var focusListener: View.OnFocusChangeListener? = null

  private fun emit(type: String) {
    sendEvent("onViolation", mapOf("type" to type, "at" to System.currentTimeMillis()))
  }

  private val poll = object : Runnable {
    override fun run() {
      if (!running) return
      val activity = context.currentActivity ?: return
      val multi = activity.isInMultiWindowMode || activity.isInPictureInPictureMode
      if (multi && !lastMulti) emit("MULTI_WINDOW")
      lastMulti = multi
      val dm = activity.getSystemService(Context.DISPLAY_SERVICE) as DisplayManager
      if (dm.displays.size > 1) emit("EXTERNAL_DISPLAY")
      if (pinned) {
        val am = activity.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
        if (am.lockTaskModeState == ActivityManager.LOCK_TASK_MODE_NONE) emit("UNPINNED")
      }
      h.postDelayed(this, 1000)
    }
  }

  override fun definition() = ModuleDefinition {
    Name("ExamGuard")
    Events("onViolation")

    Function("start") { usePinning: Boolean ->
      context.currentActivity?.runOnUiThread {
        running = true
        val decor = it.window.decorView
        decor.filterTouchesWhenObscured = true
        focusListener = View.OnFocusChangeListener { _, hasFocus ->
          if (!hasFocus) emit("WINDOW_FOCUS_LOST")
        }
        decor.viewTreeObserver.addOnWindowFocusChangeListener(focusListener)
        if (usePinning) {
          it.startLockTask()
          pinned = true
        }
        h.post(poll)
      }
    }

    Function("stop") {
      running = false
      focusListener?.let {
        context.currentActivity?.window?.decorView?.viewTreeObserver?.removeOnWindowFocusChangeListener(it)
      }
      if (pinned) {
        context.currentActivity?.stopLockTask()
        pinned = false
      }
    }

    OnAppBackground {
      if (running) emit("APP_BACKGROUND")
    }
  }
}

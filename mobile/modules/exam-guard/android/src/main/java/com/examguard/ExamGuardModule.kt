package com.examguard

import android.app.Activity
import android.app.ActivityManager
import android.content.Context
import android.hardware.display.DisplayManager
import android.os.Handler
import android.os.Looper
import android.view.View
import android.view.ViewTreeObserver
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Native Android signals used by ArcTester's assigned-exam integrity monitor.
 *
 * This is a local Expo module and deliberately uses the current Expo Modules
 * API (Module()), rather than the removed legacy UIManager constructor.
 */
class ExamGuardModule : Module() {
  private val handler = Handler(Looper.getMainLooper())
  private var running = false
  private var pinned = false
  private var lastMultiWindow = false
  private var decorView: View? = null
  private var focusListener: ViewTreeObserver.OnWindowFocusChangeListener? = null

  private val activity: Activity?
    get() = appContext.currentActivity

  private fun emit(type: String, detail: String = "") {
    sendEvent(
      "onViolation",
      mapOf(
        "type" to type,
        "at" to System.currentTimeMillis(),
        "detail" to detail
      )
    )
  }

  private fun removeFocusListener() {
    val view = decorView
    val listener = focusListener
    if (view != null && listener != null) {
      val observer = view.viewTreeObserver
      if (observer.isAlive) {
        observer.removeOnWindowFocusChangeListener(listener)
      }
    }
    focusListener = null
    decorView = null
  }

  private fun stopInternal() {
    running = false
    handler.removeCallbacks(poll)
    removeFocusListener()
    if (pinned) {
      try {
        activity?.stopLockTask()
      } catch (_: Exception) {
        // The Activity may already have been destroyed by the OS.
      }
      pinned = false
    }
    lastMultiWindow = false
  }

  private val poll = object : Runnable {
    override fun run() {
      if (!running) return
      val current = activity
      if (current != null && !current.isFinishing && !current.isDestroyed) {
        val multiWindow = current.isInMultiWindowMode || current.isInPictureInPictureMode
        if (multiWindow && !lastMultiWindow) {
          emit("MULTI_WINDOW", "App entered multi-window or picture-in-picture mode")
        }
        lastMultiWindow = multiWindow

        val displayManager = current.getSystemService(Context.DISPLAY_SERVICE) as? DisplayManager
        if ((displayManager?.displays?.size ?: 1) > 1) {
          emit("EXTERNAL_DISPLAY", "An external display is connected")
        }

        if (pinned) {
          val manager = current.getSystemService(Context.ACTIVITY_SERVICE) as? ActivityManager
          if (manager?.lockTaskModeState == ActivityManager.LOCK_TASK_MODE_NONE) {
            emit("UNPINNED", "Android screen pinning is no longer active")
            pinned = false
          }
        }
      }
      // Keep polling while an exam is active, even during Activity recreation.
      if (running) handler.postDelayed(this, 1000)
    }
  }

  override fun definition() = ModuleDefinition {
    Name("ExamGuard")
    Events("onViolation")

    Function("start") { usePinning: Boolean ->
      val current = activity ?: return@Function false
      current.runOnUiThread {
        stopInternal()
        running = true

        val view = current.window.decorView
        view.filterTouchesWhenObscured = true
        decorView = view
        val observer = view.viewTreeObserver
        if (observer.isAlive) {
          focusListener = ViewTreeObserver.OnWindowFocusChangeListener { hasFocus ->
            if (!hasFocus && running) {
              emit("WINDOW_FOCUS_LOST", "Exam window lost native window focus")
            }
          }
          observer.addOnWindowFocusChangeListener(focusListener)
        }

        if (usePinning) {
          try {
            current.startLockTask()
            pinned = true
          } catch (error: Exception) {
            emit("UNPINNED", error.message ?: "Android screen pinning could not start")
          }
        }

        handler.post(poll)
      }
      true
    }

    Function("stop") {
      handler.post { stopInternal() }
      true
    }

    OnActivityEntersBackground {
      if (running) emit("APP_BACKGROUND", "Android application entered background")
    }

    OnDestroy {
      handler.post { stopInternal() }
    }
  }
}

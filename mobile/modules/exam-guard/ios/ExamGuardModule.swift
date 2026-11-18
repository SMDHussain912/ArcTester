import ExpoModulesCore
import UIKit

public final class ExamGuardModule: Module {
  private var isRunning = false

  public func definition() -> ModuleDefinition {
    Name("ExamGuard")
    Events("onViolation")

    Function("start") { (_usePinning: Bool) -> Bool in
      self.isRunning = true
      NotificationCenter.default.removeObserver(self)
      NotificationCenter.default.addObserver(
        self,
        selector: #selector(self.screenCaptureChanged),
        name: UIScreen.capturedDidChangeNotification,
        object: nil
      )
      NotificationCenter.default.addObserver(
        self,
        selector: #selector(self.screenshotTaken),
        name: UIApplication.userDidTakeScreenshotNotification,
        object: nil
      )

      if UIScreen.main.isCaptured {
        self.emit("SCREEN_CAPTURE_ACTIVE", "Screen recording or mirroring is already active")
      }
      return true
    }

    Function("stop") {
      self.stopMonitoring()
      return true
    }

    OnAppEntersBackground {
      if self.isRunning {
        self.emit("APP_BACKGROUND", "iOS application entered background")
      }
    }

    OnAppEntersForeground {
      if self.isRunning && UIScreen.main.isCaptured {
        self.emit("SCREEN_CAPTURE_ACTIVE", "Screen recording or mirroring is active")
      }
    }

    OnDestroy {
      self.stopMonitoring()
    }
  }

  private func stopMonitoring() {
    isRunning = false
    NotificationCenter.default.removeObserver(self)
  }

  private func emit(_ type: String, _ detail: String) {
    sendEvent("onViolation", [
      "type": type,
      "at": Int64(Date().timeIntervalSince1970 * 1000),
      "detail": detail
    ])
  }

  @objc private func screenCaptureChanged() {
    guard isRunning, UIScreen.main.isCaptured else { return }
    emit("SCREEN_CAPTURE_ACTIVE", "Screen recording or mirroring started")
  }

  @objc private func screenshotTaken() {
    guard isRunning else { return }
    emit("SCREENSHOT_TAKEN", "A screenshot was captured during the exam")
  }
}

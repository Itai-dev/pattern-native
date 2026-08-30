/**
 * The watch app: the "That's it for now" button, worn.
 *
 * ONE SCREEN, ONE ANSWER. The phone flow's optional steps — context,
 * where, how it feels — do not exist here, deliberately: the product
 * already holds that a pain-only entry is a complete check-in, and a
 * 40mm screen is the strongest argument that principle will ever get.
 * Anything more detailed is what the phone is for.
 *
 * The watch NEVER writes the record. It sends {pain, ts, tz} across
 * WatchConnectivity; the phone's WatchBridge module queues it, and the
 * app's own JavaScript writes it through the same writeMoment every
 * other check-in goes through. One writer, still — the watch is an
 * input device, not a second copy of the app.
 */
import SwiftUI
import WatchConnectivity

@main
struct PatternWatchApp: App {
  var body: some Scene {
    WindowGroup {
      CheckinView()
        .onAppear { WatchSync.shared.activate() }
    }
  }
}

/** The WCSession wrapper. transferUserInfo, not sendMessage: it queues
 *  on the watch, survives reboots and airplane mode, and delivers when
 *  the phone next runs its app — a check-in made on a run must not
 *  depend on the iPhone being awake to exist. */
final class WatchSync: NSObject, WCSessionDelegate {
  static let shared = WatchSync()

  func activate() {
    guard WCSession.isSupported() else { return }
    WCSession.default.delegate = self
    WCSession.default.activate()
  }

  func send(pain: Int) {
    let payload: [String: Any] = [
      "v": 1,
      "pain": pain,
      /* capture time, not delivery time — the moment lands in the
         record at the minute it was made, however late it syncs */
      "ts": Date().timeIntervalSince1970 * 1000.0,
      "tz": TimeZone.current.secondsFromGMT() / 60,
    ]
    WCSession.default.transferUserInfo(payload)
  }

  func session(
    _ session: WCSession,
    activationDidCompleteWith activationState: WCSessionActivationState,
    error: Error?
  ) {}
}

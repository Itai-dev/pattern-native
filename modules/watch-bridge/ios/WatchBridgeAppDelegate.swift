/**
 * The phone's half of the watch conversation: a ferry, not a writer.
 *
 * WCSession must be activated at LAUNCH, from native code — queued
 * user-info transfers are delivered on activation, and an app that only
 * activates when some JS screen mounts would miss deliveries on every
 * cold start that never reached that screen. So this subscriber
 * activates in didFinishLaunching, and every delivery goes into a
 * UserDefaults queue exactly as it arrived.
 *
 * NOTHING HERE TOUCHES THE RECORD. The queue is a mailbox; the app's
 * JavaScript drains it through the same validation and the same
 * writeMoment as every other check-in. Native code that wrote SQLite
 * directly would be a second writer with its own bugs, and the one
 * writer this app has is tested.
 */
import ExpoModulesCore
import WatchConnectivity

/** the mailbox. UserDefaults (standard, app-sandboxed — this never
 *  leaves the app's own container) holding an array of plist dicts;
 *  a serial queue makes append and drain atomic, because WCSession
 *  delivers on a background thread. */
enum WatchQueue {
  static let key = "pattern.watch.queue"
  static let lock = DispatchQueue(label: "pattern.watch.queue")

  static func append(_ item: [String: Any]) {
    lock.sync {
      var q = UserDefaults.standard.array(forKey: key) as? [[String: Any]] ?? []
      q.append(item)
      /* a runaway watch cannot grow this without bound; two hundred
         undrained check-ins means the phone app has not run for months,
         and the oldest are the ones a record misses least */
      if q.count > 200 { q.removeFirst(q.count - 200) }
      UserDefaults.standard.set(q, forKey: key)
    }
  }

  static func drain() -> [[String: Any]] {
    lock.sync {
      let q = UserDefaults.standard.array(forKey: key) as? [[String: Any]] ?? []
      UserDefaults.standard.removeObject(forKey: key)
      return q
    }
  }

  static func count() -> Int {
    lock.sync {
      (UserDefaults.standard.array(forKey: key) as? [[String: Any]] ?? []).count
    }
  }
}

public class WatchBridgeAppDelegate: ExpoAppDelegateSubscriber, WCSessionDelegate {
  public func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    if WCSession.isSupported() {
      WCSession.default.delegate = self
      WCSession.default.activate()
    }
    return true
  }

  public func session(
    _ session: WCSession,
    didReceiveUserInfo userInfo: [String: Any] = [:]
  ) {
    WatchQueue.append(userInfo)
  }

  public func session(
    _ session: WCSession,
    activationDidCompleteWith activationState: WCSessionActivationState,
    error: Error?
  ) {}

  public func sessionDidBecomeInactive(_ session: WCSession) {}

  /* the session deactivates on a watch switch; reactivating is how the
     new watch's queue starts arriving */
  public func sessionDidDeactivate(_ session: WCSession) {
    session.activate()
  }
}

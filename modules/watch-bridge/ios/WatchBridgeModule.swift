/**
 * The JS-facing surface of the watch bridge: drain the mailbox, count
 * what is waiting, hand the watch its palette. Deliberately tiny — the
 * smaller the native surface, the less there is to debug through
 * TestFlight round-trips.
 */
import ExpoModulesCore
import WatchConnectivity

public class WatchBridgeModule: Module {
  public func definition() -> ModuleDefinition {
    Name("WatchBridge")

    /* returns the queued check-ins AND clears the queue, atomically.
       The caller owns them from this moment, so it must write them
       before doing anything that can fail. */
    Function("drain") { () -> [[String: Any]] in
      WatchQueue.drain()
    }

    Function("pendingCount") { () -> Int in
      WatchQueue.count()
    }

    /* the scale's colours and words, computed by the app's painScale
       and pushed as plain strings — the watch never holds a copy of
       the ramp. Application context, not user-info: latest-wins,
       held until the watch is reachable, persisted on the watch.
       Throws when no watch app is installed or the session is not up
       yet; both mean "nobody to tell", not an error the app should
       hear about. */
    Function("setContext") { (ctx: [String: Any]) in
      guard WCSession.isSupported(),
            WCSession.default.activationState == .activated else { return }
      try? WCSession.default.updateApplicationContext(ctx)
    }
  }
}

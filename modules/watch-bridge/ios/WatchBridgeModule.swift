/**
 * The JS-facing surface of the watch bridge: drain the mailbox, count
 * what is waiting, hand the watch its palette — and say when the
 * mailbox gets something. Deliberately tiny — the smaller the native
 * surface, the less there is to debug through TestFlight round-trips.
 *
 * THE EVENT. Deliveries used to sit in the mailbox until the app next
 * came to the foreground, which was fine for a check-in made on a walk
 * and wrong for one made with the phone app open on the desk: the
 * record, the widget and the reminder queue all stayed a step behind
 * something already on the phone. The app delegate posts a notification
 * when it appends; this module relays it to JS as an event, and the JS
 * drains at once. The mailbox stays the store of record, so a delivery
 * that lands with no JS listening is simply drained on the next
 * foreground as before. Nothing here writes the record.
 */
import ExpoModulesCore
import WatchConnectivity

public class WatchBridgeModule: Module {
  public func definition() -> ModuleDefinition {
    Name("WatchBridge")

    Events("onWatchCheckin")

    OnStartObserving {
      NotificationCenter.default.addObserver(
        self, selector: #selector(self.queued), name: WatchQueue.arrived, object: nil
      )
    }

    OnStopObserving {
      NotificationCenter.default.removeObserver(self, name: WatchQueue.arrived, object: nil)
    }

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

  /* the payload is deliberately empty: JS drains the mailbox itself,
     so the event carries a fact ("something arrived"), never a value */
  @objc private func queued() {
    sendEvent("onWatchCheckin", [:])
  }
}

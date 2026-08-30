/**
 * The JS-facing surface of the watch bridge: drain the mailbox, count
 * what is waiting. Deliberately tiny — the smaller the native surface,
 * the less there is to debug through TestFlight round-trips.
 */
import ExpoModulesCore

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
  }
}

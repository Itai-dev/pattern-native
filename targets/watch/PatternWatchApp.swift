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
 *
 * THE WATCH DOES NOT KNOW THE RAMP. It is told. The phone pushes the
 * scale's eleven colours, eleven inks and eleven words as application
 * context (src/watchContext.ts), computed by the same painScale every
 * phone screen reads — so the hue the user picked reaches the wrist,
 * and Swift never carries a copy that could drift. Until the first
 * push arrives the watch shows a white number in an outlined square,
 * which is honest: it knows the value and not yet the colour.
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

/** The scale's presentation, as received. Indexed by whole score. */
struct WatchPalette {
  let ramp: [Color]
  let ink: [Color]
  let words: [String]

  /* parse strictly: a context from a newer phone with a shape this
     build does not know is ignored, never half-read. Eleven of each or
     nothing — a ten-entry ramp would put a 10 out of bounds. */
  init?(_ ctx: [String: Any]) {
    /* NSNumber, not Int: the value crosses JS → Expo → plist → watch, and
       arrives as whatever number type that chain chose. `as? Int` on a
       Double 1.0 is nil; intValue on the NSNumber is 1 either way. */
    guard let v = (ctx["v"] as? NSNumber)?.intValue, v == 1,
          let ramp = ctx["ramp"] as? [String], ramp.count == 11,
          let ink = ctx["ink"] as? [String], ink.count == 11,
          let words = ctx["words"] as? [String], words.count == 11
    else { return nil }
    let colors = ramp.compactMap(Color.init(hex:))
    let inks = ink.compactMap(Color.init(hex:))
    guard colors.count == 11, inks.count == 11 else { return nil }
    self.ramp = colors
    self.ink = inks
    self.words = words
  }

  /* named apart from the stored arrays on purpose: a method `ink(_:)`
     beside a property `ink` is legal Swift but reads the property inside
     its own body through an ambiguous name, and this file cannot be
     compiled on the machine that writes it */
  func fillFor(_ score: Int) -> Color { ramp[min(10, max(0, score))] }
  func inkFor(_ score: Int) -> Color { ink[min(10, max(0, score))] }
  func wordFor(_ score: Int) -> String { words[min(10, max(0, score))] }
}

extension Color {
  /** "#RRGGBB" only — the shape painScale emits. Anything else is nil,
   *  and a nil anywhere rejects the whole palette above. */
  init?(hex: String) {
    var s = hex
    if s.hasPrefix("#") { s.removeFirst() }
    guard s.count == 6, let n = UInt32(s, radix: 16) else { return nil }
    self.init(
      red: Double((n >> 16) & 255) / 255,
      green: Double((n >> 8) & 255) / 255,
      blue: Double(n & 255) / 255
    )
  }
}

/** The WCSession wrapper. transferUserInfo, not sendMessage: it queues
 *  on the watch, survives reboots and airplane mode, and delivers when
 *  the phone next runs its app — a check-in made on a run must not
 *  depend on the iPhone being awake to exist. */
final class WatchSync: NSObject, ObservableObject, WCSessionDelegate {
  static let shared = WatchSync()

  /* what the phone last told us the scale looks like; nil until it has */
  @Published var palette: WatchPalette?

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

  private func apply(_ ctx: [String: Any]) {
    let p = WatchPalette(ctx)
    DispatchQueue.main.async { self.palette = p }
  }

  func session(
    _ session: WCSession,
    activationDidCompleteWith activationState: WCSessionActivationState,
    error: Error?
  ) {
    /* the system persists the last context it delivered, so a watch
       that wakes with the phone out of range still has its palette */
    apply(session.receivedApplicationContext)
  }

  func session(
    _ session: WCSession,
    didReceiveApplicationContext applicationContext: [String: Any]
  ) {
    apply(applicationContext)
  }
}

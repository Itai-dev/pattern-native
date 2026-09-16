/**
 * Turn the crown — or tap the square — watch it take its colour, tap
 * the check, and it is sent.
 *
 * THE SQUARE IS THE APP'S OWN. On the phone, PainShape is "one solid
 * rounded square" whose fill rides the brightness ramp under the
 * finger, and DaySquare draws every logged day the same way — an
 * unlogged day is the same square as an outline. This is that square a
 * third time, driven by the crown: an outline until the user chooses,
 * then the colour the phone says a 6 wears, with the number inside it
 * in whatever ink stays legible on that fill.
 *
 * THE VALUE STARTS UNSET — the same rule the phone's slider holds:
 * nothing is recorded until the user actually chooses, because a
 * pre-selected 5 that gets a reflexive Done is a number nobody entered.
 * Until the crown moves or the square is tapped it is empty and there
 * is nothing to confirm.
 *
 * HANDS HURT. "Hands" and "Right wrist" are in this app's vocabulary,
 * and a fine crown rotation is a pinch and a roll. So the square is
 * also a control: its left half is one step down, its right half one
 * step up, with the same settle-then-check as the crown. Two ways to
 * choose, one rule about confirming.
 *
 * THE CHECK APPEARS, IT DOES NOT ACT. When the value has been still for
 * a beat, a check button fades into a slot below; committing on
 * crown-stop alone was considered and rejected — a sleeve brushing the
 * crown, or a user pausing to think, would write a number nobody
 * confirmed, and the record's whole claim is that the number is what
 * the user entered. The pause earns the check; the tap is the entry.
 *
 * THE TAP SENDS, AT ONCE. There was a three-second Undo behind the
 * check (5–16 Sep 2026), against a brushed sleeve; the founder's call
 * was that an arm held up for a countdown after every check-in cost
 * more than the rare brush, and the settle before the check already
 * asks for a deliberate pause. So the check appears sooner, the tap
 * sends, the mark shows, and the wrist is done. A wrong number is
 * corrected on the phone, where every check-in can be edited.
 *
 * WHAT HAPPENS NEXT IS SAID. The phone's app writes the record, and it
 * does that when it next opens — a check-in made on a walk does not
 * exist on the phone until then. The confirmation says so in a line,
 * because a watch that says "done" about something the phone has not
 * yet done is a watch that lied about it.
 *
 * COLOUR AND WORDS ARE RECEIVED, NOT HELD. The ramp and the five words
 * live in painScale.ts, once; the phone pushes them here as strings
 * (see PatternWatchApp.swift). A pain value is the one thing allowed
 * to wear the ramp, so the square may; the check button stays white,
 * as every control does. With no palette yet — first launch before
 * the phone has spoken — the number is white in an outline, and the
 * caption says "pain right now" instead of a word it does not have.
 */
import SwiftUI
import WatchKit

/** how long the sent confirmation stays before the view resets */
private let SENT_SECONDS: Double = 1.8
/** stillness that earns the check — long enough that mid-turn
 *  hesitation does not flash it, short enough that it never feels
 *  withheld. Was 0.9; halved on 16 Sep 2026 because on the wrist the
 *  wait read as the app hesitating, not the person. */
private let SETTLE_SECONDS: Double = 0.45

struct CheckinView: View {
  @ObservedObject private var sync = WatchSync.shared

  /* the crown drives a Double; the answer is its rounded Int. Starts at
     the scale's middle so the first turn moves somewhere sensible, but
     the VALUE is unset until the user has actually moved something. */
  @State private var crown: Double = 5
  @State private var touched = false

  /* true once the value has been still long enough to mean "that's my
     answer"; any further change cancels it. Held as a work item so a
     new change can revoke the pending settle instead of racing it. */
  @State private var settled = false
  @State private var settleTask: DispatchWorkItem?

  /* the send happened; the confirmation is showing */
  @State private var sent = false

  private var value: Int { min(10, max(0, Int(crown.rounded()))) }

  private var caption: String {
    if !touched { return "turn or tap to choose" }
    return sync.palette?.wordFor(value) ?? "pain right now"
  }

  /* a change of value from either hand: mark it, and start the settle
     over — the check is earned by stillness, whichever control moved */
  private func changed() {
    touched = true
    settled = false
    settleTask?.cancel()
    let task = DispatchWorkItem { settled = true }
    settleTask = task
    DispatchQueue.main.asyncAfter(deadline: .now() + SETTLE_SECONDS, execute: task)
  }

  private func step(_ by: Int) {
    let next = min(10, max(0, value + by))
    if !touched || next != value {
      WKInterfaceDevice.current().play(.click)
      crown = Double(next)
      changed()
    }
  }

  /* the tap is the entry: sent now, marked now, one success tap on the
     wrist to say so */
  private func confirm() {
    WatchSync.shared.send(pain: value)
    WKInterfaceDevice.current().play(.success)
    sent = true
  }

  private func reset() {
    sent = false
    touched = false
    settled = false
    crown = 5
  }

  var body: some View {
    if sent {
      /* the phone's done screen, shrunk: a check mark, and the one line
         that says where the number is now — no score echo, no colour */
      VStack(spacing: 10) {
        Image(systemName: "checkmark")
          .font(.system(size: 40, weight: .semibold))
          .foregroundStyle(.white)
        Text("Sent. It lands in Pattern when your iPhone next opens it.")
          .font(.caption2)
          .foregroundStyle(.secondary)
          .multilineTextAlignment(.center)
      }
      .onAppear {
        DispatchQueue.main.asyncAfter(deadline: .now() + SENT_SECONDS) { reset() }
      }
    } else {
      GeometryReader { geo in
        /* the square takes what height the caption and the check slot
           leave; capped so a 45mm does not draw a billboard, floored so
           a 40mm still reads as a square and not a chip */
        let side = max(84, min(112, geo.size.height - 82))
        let fill = touched ? sync.palette?.fillFor(value) : nil

        VStack(spacing: 6) {
          ZStack {
            if let fill {
              RoundedRectangle(cornerRadius: side * 0.24, style: .continuous)
                .fill(fill)
                /* PainShape's one glow: the surface's own colour, soft —
                   a brighter value casts more light on the black ground */
                .shadow(color: fill.opacity(0.45), radius: 14)
            } else {
              /* DaySquare's unlogged day: the same square, as an outline */
              RoundedRectangle(cornerRadius: side * 0.24, style: .continuous)
                .strokeBorder(Color.white.opacity(0.28), lineWidth: 1.5)
            }
            Text(touched ? "\(value)" : "–")
              .font(.system(size: side * 0.45, weight: .bold, design: .rounded))
              .foregroundStyle(
                touched ? (sync.palette?.inkFor(value) ?? .white) : Color.secondary
              )
              .contentTransition(.numericText())

            /* the two halves: down on the left, up on the right. Clear
               and shaped so the whole half is the target; no glyphs,
               because the square is not a stepper to look at, only one
               to use. */
            HStack(spacing: 0) {
              Color.clear.contentShape(Rectangle())
                .onTapGesture { step(-1) }
                .accessibilityLabel("One less")
              Color.clear.contentShape(Rectangle())
                .onTapGesture { step(1) }
                .accessibilityLabel("One more")
            }
          }
          .frame(width: side, height: side)
          .animation(.easeOut(duration: 0.15), value: value)

          Text(caption)
            .font(.footnote)
            .foregroundStyle(.secondary)
            .frame(height: 18)

          /* a fixed slot for the check, so the square never moves when
             it arrives or leaves */
          ZStack {
            if settled && touched {
              Button(action: confirm) {
                Image(systemName: "checkmark")
                  .font(.system(size: 20, weight: .semibold))
              }
              .buttonStyle(.borderedProminent)
              .tint(.white)
              .foregroundStyle(.black)
              .transition(.opacity)
            }
          }
          .frame(height: 44)
          .animation(.easeInOut(duration: 0.15), value: settled)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
      }
      .focusable(true)
      .digitalCrownRotation(
        $crown, from: 0, through: 10, by: 1,
        sensitivity: .medium, isContinuous: false, isHapticFeedbackEnabled: true
      )
      .onChange(of: crown) { changed() }
    }
  }
}

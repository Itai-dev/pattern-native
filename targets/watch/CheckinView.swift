/**
 * Turn the crown, watch the square take its colour, tap the check.
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
 * Until the crown moves the square is empty and there is nothing to
 * confirm.
 *
 * THE CHECK APPEARS, IT DOES NOT ACT. When the crown has been still for
 * a beat, a check button fades into a slot below; committing on
 * crown-stop alone was considered and rejected — a sleeve brushing the
 * crown, or a user pausing to think, would write a number nobody
 * confirmed, and the record's whole claim is that the number is what
 * the user entered. The pause earns the check; the tap is the entry.
 * Turning again dismisses it and goes back to choosing.
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

struct CheckinView: View {
  @ObservedObject private var sync = WatchSync.shared

  /* the crown drives a Double; the answer is its rounded Int. Starts at
     the scale's middle so the first turn moves somewhere sensible, but
     the VALUE is unset until the user has actually moved something. */
  @State private var crown: Double = 5
  @State private var touched = false
  @State private var sent = false

  /* true once the crown has been still long enough to mean "that's my
     answer"; any further turn cancels it. Held as a work item so a new
     turn can revoke the pending settle instead of racing it. */
  @State private var settled = false
  @State private var settleTask: DispatchWorkItem?

  private var value: Int { min(10, max(0, Int(crown.rounded()))) }

  private var caption: String {
    if !touched { return "turn to choose" }
    return sync.palette?.wordFor(value) ?? "pain right now"
  }

  var body: some View {
    if sent {
      /* the phone's done screen, shrunk: a check mark and nothing else —
         no score echo, no colour, no words, gone on its own */
      Image(systemName: "checkmark")
        .font(.system(size: 44, weight: .semibold))
        .foregroundStyle(.white)
        .onAppear {
          DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) {
            sent = false
            touched = false
            settled = false
            crown = 5
          }
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
          }
          .frame(width: side, height: side)
          .animation(.easeOut(duration: 0.15), value: value)

          Text(caption)
            .font(.footnote)
            .foregroundStyle(.secondary)
            .frame(height: 18)

          /* a fixed slot for the check, so the square never moves when
             the check arrives or leaves */
          ZStack {
            if settled && touched {
              Button {
                WatchSync.shared.send(pain: value)
                WKInterfaceDevice.current().play(.success)
                sent = true
              } label: {
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
          .animation(.easeInOut(duration: 0.2), value: settled)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
      }
      .focusable(true)
      .digitalCrownRotation(
        $crown, from: 0, through: 10, by: 1,
        sensitivity: .medium, isContinuous: false, isHapticFeedbackEnabled: true
      )
      .onChange(of: crown) {
        touched = true
        settled = false
        settleTask?.cancel()
        /* 0.9s of stillness: long enough that mid-turn hesitation does
           not flash the check, short enough that the confirm never feels
           withheld */
        let task = DispatchWorkItem { settled = true }
        settleTask = task
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.9, execute: task)
      }
    }
  }
}

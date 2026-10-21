/**
 * Turn the crown — or tap the square — watch it take its colour, tap
 * Done, and it is sent.
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
 * DONE IS EARNED, IT DOES NOT ACT ON ITS OWN. When the value has been
 * still for a beat, the Done button below wakes; committing on
 * crown-stop alone was considered and rejected — a sleeve brushing the
 * crown, or a user pausing to think, would write a number nobody
 * confirmed, and the record's whole claim is that the number is what
 * the user entered. The pause earns Done; the tap is the entry.
 *
 * THE REDESIGN'S LAYOUT (Watch mockup, 21 Oct 2026, build 49): the
 * square large, the number inside it in SF Rounded, the word under it,
 * and one full-width white Done — the phone's primary button, worn. Done
 * is ALWAYS in its slot, so the square never moves; until there is a
 * still, chosen value it is dimmed and does nothing. It was a check mark
 * that faded in and out of an empty slot; a button that is always there
 * says what the screen is for before the crown has moved.
 *
 * THE TAP SENDS, AT ONCE. There was a three-second Undo behind the
 * check (5–16 Sep 2026), against a brushed sleeve; the founder's call
 * was that an arm held up for a countdown after every check-in cost
 * more than the rare brush, and the settle before Done already asks
 * for a deliberate pause. So the tap sends, the mark shows, and the
 * wrist is done. A wrong number is corrected on the phone, where every
 * check-in can be edited.
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
 * to wear the ramp, so the square may; Done stays white, as every
 * control does. The number inside the square is black or white by the
 * fill's luminance, as on the phone's check-in. With no palette yet —
 * first launch before the phone has spoken — the number is white in an
 * outline, and the line under it says "Pain right now" instead of a
 * word it does not have.
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
    if !touched { return "Turn or tap to choose" }
    return sync.palette?.wordFor(value) ?? "Pain right now"
  }

  /* the word is the answer's own, so it is set like the mockup's "Mild":
     white and semibold. The two stand-ins — before a choice, and before
     the phone has said the words — are grey, because they are about the
     screen and not about the pain */
  private var captionIsWord: Bool { touched && sync.palette != nil }

  /* black or white by the fill, once there is a fill; white on an
     outline (no palette yet); grey for the dash before a choice */
  private var numberInk: Color {
    if !touched { return Color.secondary }
    return sync.palette?.markFor(value) ?? Color.white
  }

  /* Done answers only a still, chosen value */
  private var ready: Bool { touched && settled }

  /* a String, not a literal at the call site: a ternary of two literals
     against accessibilityHint's LocalizedStringKey and StringProtocol
     overloads is a type-check gamble this file cannot test here */
  private var doneHint: String {
    ready ? "Sends this number to Pattern on your iPhone" : "Choose a number first"
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
        /* the square takes what height the word and Done leave (6 + 20
           + at least 6 + 40, plus a little air); capped at the mockup's
           side so a 49mm does not draw a billboard, floored so a 40mm
           still reads as a square and not a chip */
        let side = max(72, min(100, geo.size.height - 78))
        let fill = touched ? sync.palette?.fillFor(value) : nil
        /* the mockup's 28 on 96: a touch rounder than the phone's day
           squares, because at this size the corner is what reads */
        let corner = side * 0.29

        VStack(spacing: 0) {
          Spacer(minLength: 0)

          ZStack {
            if let fill {
              RoundedRectangle(cornerRadius: corner, style: .continuous)
                .fill(fill)
              /* the mockup's inset hairline: on black, the darkest
                 stops of the ramp would otherwise lose their edge */
              RoundedRectangle(cornerRadius: corner, style: .continuous)
                .strokeBorder(Color.white.opacity(0.16), lineWidth: 1)
            } else {
              /* DaySquare's unlogged day: the same square, as an outline */
              RoundedRectangle(cornerRadius: corner, style: .continuous)
                .strokeBorder(Color.white.opacity(0.28), lineWidth: 1.5)
            }
            Text(touched ? "\(value)" : "–")
              /* SF Rounded, as every number in the redesign; 60 on 96
                 in the mockup. Monospaced digits so 9 → 10 does not
                 shift the glyphs sideways under the crown. */
              .font(.system(size: side * 0.6, weight: .bold, design: .rounded))
              .monospacedDigit()
              .minimumScaleFactor(0.6)
              .lineLimit(1)
              .foregroundStyle(numberInk)
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

          /* the word under the square — "Mild", never the number again */
          Text(caption)
            .font(captionIsWord ? Font.system(size: 15, weight: .semibold) : Font.footnote)
            .foregroundStyle(captionIsWord ? Color.white : Color.secondary)
            .lineLimit(1)
            .minimumScaleFactor(0.8)
            .frame(height: 20)
            .padding(.top, 6)

          Spacer(minLength: 6)

          /* the one control: white, black words, fully rounded — the
             phone's primary button. A plain style so watchOS does not
             draw its own platter behind ours; dimmed, never hidden,
             until a still, chosen value earns it */
          Button(action: confirm) {
            Text("Done")
              .font(.system(size: 16, weight: .semibold))
              .foregroundStyle(Color.black)
              .frame(maxWidth: .infinity)
              .frame(height: 40)
              .background(Capsule().fill(Color.white))
              .contentShape(Capsule())
          }
          .buttonStyle(.plain)
          .disabled(!ready)
          .opacity(ready ? 1 : 0.35)
          .animation(.easeInOut(duration: 0.15), value: ready)
          .accessibilityHint(doneHint)
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

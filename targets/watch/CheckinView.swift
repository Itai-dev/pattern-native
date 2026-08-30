/**
 * Turn the crown, see the number, tap Done.
 *
 * THE VALUE STARTS UNSET — the same rule the phone's slider holds:
 * nothing is recorded until the user actually chooses, because a
 * pre-selected 5 that gets a reflexive Done is a number nobody entered.
 * Until the crown moves or a button is tapped, the screen shows a dash
 * and Done is disabled.
 *
 * WHITE, NOT THE RAMP. On the phone a pain value wears the theme's
 * colour, but the ramp's hue is the user's choice and lives in the
 * app's own palette code; a second copy in Swift would drift the first
 * time a theme is touched. The number is white — the colour every
 * control and count wears — and the meaning is carried by the digits,
 * which is what the record stores anyway.
 *
 * No labels either ("Moderate" etc.), for the same reason: the five
 * words are defined once, in painScale.ts, and a sixth vocabulary
 * duplicated into Swift is how two surfaces end up disagreeing about
 * what a 4 is called.
 */
import SwiftUI
import WatchKit

struct CheckinView: View {
  /* the crown drives a Double; the answer is its rounded Int. Starts at
     the scale's middle so the first turn moves somewhere sensible, but
     the VALUE is unset until the user has actually moved something. */
  @State private var crown: Double = 5
  @State private var touched = false
  @State private var sent = false

  private var value: Int { min(10, max(0, Int(crown.rounded()))) }

  var body: some View {
    if sent {
      /* the phone's done screen, shrunk: a check mark and nothing else —
         no score echo, no words, gone on its own */
      Image(systemName: "checkmark")
        .font(.system(size: 44, weight: .semibold))
        .foregroundStyle(.white)
        .onAppear {
          DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) {
            sent = false
            touched = false
            crown = 5
          }
        }
    } else {
      VStack(spacing: 6) {
        Text(touched ? "\(value)" : "–")
          .font(.system(size: 54, weight: .bold, design: .rounded))
          .foregroundStyle(.white)
          .contentTransition(.numericText())

        Text(touched ? "pain right now" : "turn to choose")
          .font(.footnote)
          .foregroundStyle(.secondary)

        HStack(spacing: 10) {
          Button {
            if touched { crown = Double(max(0, value - 1)) } else { touched = true }
          } label: { Image(systemName: "minus") }
            .disabled(touched && value == 0)
          Button {
            if touched { crown = Double(min(10, value + 1)) } else { touched = true }
          } label: { Image(systemName: "plus") }
            .disabled(touched && value == 10)
        }
        .buttonStyle(.bordered)
        .controlSize(.small)

        Button("Done") {
          WatchSync.shared.send(pain: value)
          WKInterfaceDevice.current().play(.success)
          sent = true
        }
        .buttonStyle(.borderedProminent)
        .tint(.white)
        .foregroundStyle(.black)
        .disabled(!touched)
      }
      .focusable(true)
      .digitalCrownRotation(
        $crown, from: 0, through: 10, by: 1,
        sensitivity: .medium, isContinuous: false, isHapticFeedbackEnabled: true
      )
      .onChange(of: crown) { touched = true }
    }
  }
}

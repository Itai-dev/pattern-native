/**
 * Turn the crown, watch the slider fill, tap the check.
 *
 * THE VALUE STARTS UNSET — the same rule the phone's slider holds:
 * nothing is recorded until the user actually chooses, because a
 * pre-selected 5 that gets a reflexive Done is a number nobody entered.
 * Until the crown moves, the screen shows a dash and there is nothing
 * to confirm.
 *
 * THE CHECK APPEARS, IT DOES NOT ACT. While the crown is turning the
 * bottom slot shows the slider's meaning ("pain right now"); when the
 * crown has been still for a beat, a check button fades in. Committing
 * on crown-stop alone was considered and rejected: a sleeve brushing
 * the crown, or a user pausing to think, would write a number nobody
 * confirmed — and the record's whole claim is that the number is what
 * the user entered. The pause earns the check; the tap is the entry.
 * Turning again dismisses it and goes back to choosing.
 *
 * WHITE, NOT THE RAMP. On the phone a pain value wears the theme's
 * colour, but the ramp's hue is the user's choice and lives in the
 * app's own palette code; a second copy in Swift would drift the first
 * time a theme is touched. The number and the slider fill are white —
 * the colour every control and count wears — and the meaning is carried
 * by the digits, which is what the record stores anyway.
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

  /* true once the crown has been still long enough to mean "that's my
     answer"; any further turn cancels it. Held as a work item so a new
     turn can revoke the pending settle instead of racing it. */
  @State private var settled = false
  @State private var settleTask: DispatchWorkItem?

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
            settled = false
            crown = 5
          }
        }
    } else {
      VStack(spacing: 8) {
        Text(touched ? "\(value)" : "–")
          .font(.system(size: 54, weight: .bold, design: .rounded))
          .foregroundStyle(.white)
          .contentTransition(.numericText())

        /* the slider the crown is dragging: a track with a white fill up
           to the chosen value. It shows position, not judgement — same
           bar at 2 and at 9, only longer. Empty until touched, so the
           unset state stays visibly unset. */
        GeometryReader { geo in
          ZStack(alignment: .leading) {
            Capsule().fill(.white.opacity(0.25))
            if touched {
              Capsule()
                .fill(.white)
                /* value 0 keeps a visible nub — a chosen 0 must not look
                   like the never-chosen empty track */
                .frame(width: max(6, geo.size.width * CGFloat(value) / 10))
            }
          }
        }
        .frame(height: 6)
        .padding(.horizontal, 8)

        /* one slot, two occupants, fixed height so the face never jumps:
           the hint while choosing, the check once the crown settles */
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
          } else {
            Text(touched ? "pain right now" : "turn to choose")
              .font(.footnote)
              .foregroundStyle(.secondary)
          }
        }
        .frame(height: 44)
        .animation(.easeInOut(duration: 0.2), value: settled)
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

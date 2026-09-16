/**
 * The last seven days, on the wrist — the widget's week strip, worn.
 *
 * SEVEN SQUARES, COLOUR ONLY. Each day is the app's own square in the
 * colour its average wears on the phone's calendar; a day with nothing
 * recorded is the same square as an outline, exactly as DaySquare draws
 * it. No number, no average as a figure, no count of days logged: a
 * wrist is read by whoever is across the table, and the calm-surface
 * rule the lock-screen widget follows applies here with more force.
 * What a person sees is the shape of their week, which is the second
 * thing this app is for (POSITIONING.md) — and nothing that rates today.
 *
 * THE WATCH STILL HOLDS NO RECORD. The seven fills arrive with the
 * palette, as application context computed by the phone from the same
 * dailyAverage and painColor every phone screen reads (watchContext.ts);
 * the watch draws strings it was handed and keeps nothing else. Until
 * the phone has spoken there is nothing to draw, and the view says so
 * rather than drawing seven empty squares that would read as a week of
 * nothing logged.
 */
import SwiftUI

struct WeekView: View {
  @ObservedObject private var sync = WatchSync.shared

  var body: some View {
    GeometryReader { geo in
      let week = sync.palette?.week ?? []
      let letters = sync.palette?.letters ?? []
      /* seven across with a gap, capped so a 45mm does not draw tiles */
      let gap: CGFloat = 5
      let side = min(24, (geo.size.width - gap * 6) / 7)

      VStack(spacing: 10) {
        Text("The last seven days")
          .font(.footnote)
          .foregroundStyle(.secondary)

        if week.count == 7 {
          HStack(spacing: gap) {
            ForEach(0..<7, id: \.self) { i in
              VStack(spacing: 4) {
                ZStack {
                  if let fill = week[i] {
                    RoundedRectangle(cornerRadius: side * 0.24, style: .continuous)
                      .fill(fill)
                  } else {
                    RoundedRectangle(cornerRadius: side * 0.24, style: .continuous)
                      .strokeBorder(Color.white.opacity(0.28), lineWidth: 1.5)
                  }
                }
                .frame(width: side, height: side)
                /* today is the last square: its letter is the bright one */
                Text(i < letters.count ? letters[i] : "")
                  .font(.system(size: 10, weight: i == 6 ? .bold : .regular, design: .rounded))
                  .foregroundStyle(i == 6 ? Color.white : Color.secondary)
              }
            }
          }
          .accessibilityElement(children: .ignore)
          .accessibilityLabel(weekSpoken(week, letters))

          /* what the colours are not, beside them — the sentence every
             surface with a value carries */
          Text("Colour is the day's average. An outline is a day with nothing recorded.")
            .font(.caption2)
            .foregroundStyle(.secondary)
            .multilineTextAlignment(.center)
        } else {
          Text("Open Pattern on your iPhone once and your week appears here.")
            .font(.caption2)
            .foregroundStyle(.secondary)
            .multilineTextAlignment(.center)
        }
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
  }

  /* VoiceOver gets the days as logged or not — never a number, for the
     same reason the squares carry none */
  private func weekSpoken(_ week: [Color?], _ letters: [String]) -> String {
    let logged = week.filter { $0 != nil }.count
    return "The last seven days: \(logged) with a check-in, \(7 - logged) without."
  }
}

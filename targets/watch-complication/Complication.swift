/**
 * The complication: the app's square, on the face, opening the check-in.
 *
 * A STATIC TIMELINE WITH ONE ENTRY. It never changes, because it knows
 * nothing — the record lives on the phone and the watch is an input
 * device. A complication that showed today's number would be a pain
 * score on a wrist that anyone across a table can read, and one that
 * showed a count would be the streak this app refuses. So: the outline
 * square and the word "Log", in every accessory family, in the
 * face's own tint. Tapping any of them launches the watch app, which is
 * the check-in — watchOS opens the containing app for a tap on a
 * complication without a URL being involved.
 *
 * The square is drawn the way the watch app and the phone draw it: a
 * continuous-corner rounded rectangle, stroked, never filled — a fill
 * is a value and there is none to show.
 *
 * THE REDESIGN (21 Oct 2026, build 49) is type and glyphs only: the
 * system font's rounded design, as every figure and label on the
 * redesigned watch, white glyphs, and the rectangular slot set like the
 * mockup's Smart Stack card — a small grey capitalised label over one
 * large rounded line. The mockup's card says "NEXT RUN · 33 min easy";
 * that needs the phone's next step sent to the watch, which is a change
 * to the WatchConnectivity contract and to what leaves the phone's
 * record, so it is not here. Until it is argued and built, the slot is
 * still the door, and it still shows no data.
 */
import SwiftUI
import WidgetKit

struct DoorEntry: TimelineEntry {
  let date: Date
}

struct DoorProvider: TimelineProvider {
  func placeholder(in context: Context) -> DoorEntry { DoorEntry(date: Date()) }
  func getSnapshot(in context: Context, completion: @escaping (DoorEntry) -> Void) {
    completion(DoorEntry(date: Date()))
  }
  func getTimeline(in context: Context, completion: @escaping (Timeline<DoorEntry>) -> Void) {
    /* one entry, never refreshed: there is nothing to refresh */
    completion(Timeline(entries: [DoorEntry(date: Date())], policy: .never))
  }
}

/** the app's square at a given side, stroked */
struct DoorSquare: View {
  let side: CGFloat
  var body: some View {
    /* 0.27 of the side: the phone's day square (11 on 40). White, the
       glyph colour of the redesign; a tinted face re-tints it, which is
       the face's business and carries no value either way. */
    RoundedRectangle(cornerRadius: side * 0.27, style: .continuous)
      .strokeBorder(Color.white, lineWidth: max(1.5, side * 0.09))
      .frame(width: side, height: side)
  }
}

struct DoorView: View {
  @Environment(\.widgetFamily) private var family

  var body: some View {
    slot
      /* SF Rounded across every family — at the root, so a family added
         later inherits it. A Text with an explicit .system(size:) font
         names .rounded itself too, because an explicit font is not
         guaranteed to take the environment's design. fontDesign is
         watchOS 9.1; the target is 10. */
      .fontDesign(.rounded)
  }

  @ViewBuilder
  private var slot: some View {
    switch family {
    case .accessoryCircular:
      /* the square alone: a circular slot is too small for a word to
         sit under it and stay legible */
      ZStack {
        AccessoryWidgetBackground()
        DoorSquare(side: 22)
      }
      .widgetLabel { Text("Pattern") }
    case .accessoryInline:
      /* inline is text; the square becomes the plus it has on Today */
      Label("Pattern · check in", systemImage: "plus.square")
    case .accessoryCorner:
      DoorSquare(side: 18)
        .widgetLabel { Text("Check in") }
    default:
      /* rectangular: the mockup's Smart Stack card, as a door — the
         square where its glyph sits, a small grey label, and one large
         white line that says what a tap does */
      HStack(spacing: 10) {
        DoorSquare(side: 24)
        VStack(alignment: .leading, spacing: 1) {
          Text("Pattern")
            .font(.system(size: 11, weight: .bold, design: .rounded))
            .textCase(.uppercase)
            .foregroundStyle(.secondary)
          Text("Check in")
            .font(.system(size: 20, weight: .bold, design: .rounded))
            .foregroundStyle(Color.white)
            .lineLimit(1)
            .minimumScaleFactor(0.8)
        }
        Spacer(minLength: 0)
      }
    }
  }
}

@main
struct PatternComplication: Widget {
  let kind = "PatternComplication"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: DoorProvider()) { _ in
      DoorView()
        /* watchOS 10 draws its own container; the view provides none */
        .containerBackground(for: .widget) { Color.clear }
    }
    .configurationDisplayName("Pattern")
    .description("Opens the pain check-in.")
    .supportedFamilies([
      .accessoryCircular, .accessoryRectangular, .accessoryInline, .accessoryCorner,
    ])
  }
}

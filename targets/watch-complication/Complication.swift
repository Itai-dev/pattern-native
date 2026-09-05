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
    RoundedRectangle(cornerRadius: side * 0.24, style: .continuous)
      .strokeBorder(lineWidth: max(1.5, side * 0.09))
      .frame(width: side, height: side)
  }
}

struct DoorView: View {
  @Environment(\.widgetFamily) private var family

  var body: some View {
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
      /* rectangular: the square and the two words that say what a tap does */
      HStack(spacing: 10) {
        DoorSquare(side: 26)
        VStack(alignment: .leading, spacing: 2) {
          Text("Pattern").font(.headline)
          Text("Check in").font(.caption2).foregroundStyle(.secondary)
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

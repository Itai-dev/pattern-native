/**
 * The watch-face complication: one tap from the face into the check-in.
 *
 * Without it the route to a watch check-in is crown, app grid, find
 * Pattern, launch — which costs more than unlocking the phone, and the
 * whole argument for the watch is that it should cost less. A
 * complication is a WidgetKit extension EMBEDDED IN THE WATCH APP, not
 * in the iPhone app; apple-targets' `watch-widget` type does that
 * embedding (see with-xcode-changes.js, "Embed Foundation Extensions"
 * on the watchOS target).
 *
 * It shows NO DATA. The watch holds no record and the complication is
 * told nothing — it is a door with the app's square on it. That is
 * also what keeps it honest under the calm-surface rule: nothing on a
 * watch face can differ between two glances.
 *
 * Its bundle id nests under the watch app's, as watchOS requires —
 * and it is '.face', not '.complication': Apple's App ID registry
 * refused the longer one as not available to this team, with no reason
 * given, and the build stopped there. It is
 * one more target that needs the owner's interactive build once — the
 * same step the watch app itself is waiting on, and the same build.
 */
/** @type {import('@bacons/apple-targets/app.plugin').Config} */
module.exports = {
  type: 'watch-widget',
  name: 'PatternComplication',
  displayName: 'Pattern',
  bundleIdentifier: '.watch.face',
  deploymentTarget: '10.0',
  frameworks: ['WidgetKit', 'SwiftUI'],
};

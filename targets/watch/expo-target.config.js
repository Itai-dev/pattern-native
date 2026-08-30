/**
 * The Apple Watch app target, generated into the Xcode project at
 * prebuild by @bacons/apple-targets. Everything in this folder is
 * SOURCE; the ios/ folder it lands in is derived and never edited.
 *
 * The bundle id is the app's with `.watch` appended (the leading dot is
 * the plugin's append syntax) — the shape Apple requires for a watch
 * app to pair with its phone app. EAS provisions it like it already
 * provisions the widget extension's.
 */
/** @type {import('@bacons/apple-targets/app.plugin').Config} */
module.exports = {
  type: 'watch',
  name: 'PatternWatch',
  displayName: 'Pattern',
  bundleIdentifier: '.watch',
  /* watchOS 10 — two years old at time of writing, and the SwiftUI
     APIs used here (digitalCrownRotation, NavigationStack) are all
     older than it */
  deploymentTarget: '10.0',
  icon: '../../assets/icon.png',
  frameworks: ['SwiftUI', 'WatchConnectivity'],
};

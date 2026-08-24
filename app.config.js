/**
 * One config, two apps.
 *
 * APP_VARIANT=development produces "Pattern Dev" — its own bundle id, its
 * own scheme, its own data, sitting BESIDE the real app rather than
 * replacing it. It exists so fresh-install flows (onboarding, first
 * check-in, delete-everything) can be tested without the tester's own
 * record ever being the thing at stake.
 *
 * Everything else reads straight from app.json, so the production build
 * is byte-for-byte what it always was.
 */
const { expo } = require('./app.json');

const IS_DEV = process.env.APP_VARIANT === 'development';

module.exports = {
  expo: {
    ...expo,
    name: IS_DEV ? 'Pattern Dev' : expo.name,
    scheme: IS_DEV ? 'patterndev' : expo.scheme,
    ios: {
      ...expo.ios,
      bundleIdentifier: IS_DEV
        ? expo.ios.bundleIdentifier + '.dev'
        : expo.ios.bundleIdentifier,
    },
    android: {
      ...expo.android,
      package: IS_DEV ? expo.android.package + '.dev' : expo.android.package,
    },
  },
};

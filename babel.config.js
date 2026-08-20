/* Reanimated's worklet transform must run last. Expo's preset carries it in
   recent SDKs, but naming it explicitly makes the requirement visible rather
   than implicit — this file exists so nobody wonders why gestures broke. */
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: ['react-native-worklets/plugin'],
  };
};

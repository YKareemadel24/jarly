module.exports = function (api) {
  api.cache(true);

  // No `plugins` entry for `react-native-worklets/plugin` on purpose: it is added
  // automatically by `babel-preset-expo` (babel-preset-expo/build/configs/expo.js
  // — "Automatically add worklets or reanimated plugin when package is installed")
  // and again by `nativewind/babel`. Listing it a third time here is redundant;
  // verified to produce byte-identical output for worklet and Reanimated files.
  return {
    presets: [
      ["babel-preset-expo", { jsxImportSource: "nativewind" }],
      "nativewind/babel",
    ],
  };
};

module.exports = function (api) {
  api.cache(true);

  return {
    presets: [
      ["babel-preset-expo", { jsxImportSource: "nativewind" }],
      "nativewind/babel",
    ],
    // CRITICAL: babel-preset-expo has a bug where it uses if/else-if for
    // worklets vs reanimated plugins. When BOTH packages are installed,
    // it only adds react-native-worklets/plugin and SKIPS
    // react-native-reanimated/plugin entirely. Without the Reanimated
    // Babel plugin, useAnimatedStyle/useSharedValue/etc are not
    // transformed, causing an immediate silent crash on launch.
    // We must explicitly add both plugins here, in order, with reanimated last.
    plugins: [
      "react-native-worklets/plugin",
      "react-native-reanimated/plugin",
    ],
  };
};

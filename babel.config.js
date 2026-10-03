module.exports = function (api) {
  api.cache(true);

  return {
    presets: [
      ["babel-preset-expo", { jsxImportSource: "nativewind" }],
      "nativewind/babel",
    ],
    // No explicit `plugins` entry for the worklets/Reanimated plugin on purpose.
    //
    // `babel-preset-expo` already registers it automatically
    // (babel-preset-expo/build/configs/expo.js — "Automatically add worklets or
    // reanimated plugin when package is installed"), and in Reanimated 4 the
    // reanimated plugin is *literally the same module* as the worklets plugin:
    //   node_modules/react-native-reanimated/plugin/index.js
    //     -> module.exports = require('react-native-worklets/plugin')
    //
    // Listing it here therefore registers the SAME plugin twice, which makes
    // Babel throw "Duplicate plugin/preset detected" while the Metro
    // Transformer is being constructed. Metro swallows that constructor error
    // (Bundler.js only console.errors it), leaving `this._transformer`
    // undefined — which later surfaces as the misleading:
    //   Metro error: Cannot read properties of undefined (reading 'transformFile')
    //
    // `useAnimatedStyle`/`useSharedValue` in components/jar-vessel.tsx are still
    // transformed correctly, because the preset supplies the worklets plugin.
  };
};

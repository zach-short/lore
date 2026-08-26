// eslint-disable-next-line @typescript-eslint/no-require-imports
const { getDefaultConfig } = require("expo/metro-config");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { withNativewind } = require("nativewind/metro");

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

module.exports = withNativewind(config, {
  // Inlining variables breaks PlatformColor inside CSS variables on native.
  inlineVariables: false,
  // className support is added explicitly through src/tw wrappers instead of
  // patching every React Native primitive.
  globalClassNamePolyfill: false,
});

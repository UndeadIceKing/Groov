const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// react-native ships a nested copy of itself inside its own node_modules.
// Metro resolves that nested copy and fails on VirtualViewExperimentalNativeComponent
// because its onModeChange event has no codegen definition in the nested version.
// Block the nested path so Metro always uses the top-level react-native only.
config.resolver.blockList = [
  /node_modules[/\\]react-native[/\\]node_modules[/\\]react-native[/\\].*/,
];

module.exports = config;

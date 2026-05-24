// Standalone Metro config — résout les libs workspace vendored (@sally/*).
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');
const config = getDefaultConfig(__dirname);
config.resolver = config.resolver || {};
config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules || {}),
  '@sally/game-engine': path.resolve(__dirname, 'vendor/game-engine'),
  '@sally/types': path.resolve(__dirname, 'vendor/types'),
};
config.watchFolders = [...(config.watchFolders || []), path.resolve(__dirname, 'vendor')];
module.exports = config;

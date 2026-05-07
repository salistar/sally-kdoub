// Standalone Metro config for SallyCards app.
// Pas de workspace root - chaque repo est autonome avec ses propres node_modules.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

module.exports = config;

// Standalone metro config with workspace fallback for missing local deps.
// CRITICAL: any package that exists in the app's own node_modules MUST be
// resolved from that copy — even when a transitive dep at the workspace root
// imports it. Otherwise we end up with two physical copies of native modules
// (react-native-safe-area-context, react-native-screens, etc.) loaded at
// runtime, which manifests as "Tried to register two views with the same
// name RNCSafeAreaProvider" + React hooks crashing with "useState of null".
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');
const fs = require('fs');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '..', '..', '..');
const config = getDefaultConfig(projectRoot);

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

const APP_NODE_MODULES = path.resolve(projectRoot, 'node_modules');

function appHasPackage(pkgName) {
  try {
    return fs.existsSync(path.join(APP_NODE_MODULES, pkgName, 'package.json'));
  } catch {
    return false;
  }
}

function getPackageName(moduleName) {
  if (moduleName.startsWith('@')) {
    const parts = moduleName.split('/');
    return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : moduleName;
  }
  return moduleName.split('/')[0];
}

const originalResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  // Skip relative / absolute imports.
  if (
    moduleName.startsWith('.') ||
    moduleName.startsWith('/') ||
    /^[a-zA-Z]:[\\/]/.test(moduleName)
  ) {
    return (originalResolveRequest || context.resolveRequest)(context, moduleName, platform);
  }

  const pkgName = getPackageName(moduleName);

  // If the app's own node_modules has this package, force resolution to use
  // that copy (regardless of who is importing it). This pins ONE physical
  // instance per package across the whole bundle.
  if (appHasPackage(pkgName)) {
    return (originalResolveRequest || context.resolveRequest)(
      { ...context, originModulePath: path.join(APP_NODE_MODULES, pkgName, 'package.json') },
      moduleName,
      platform
    );
  }

  return (originalResolveRequest || context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;

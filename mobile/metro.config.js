// Metro config: lets the app import the shared API contracts in ../src/lib/types.ts
// via the `@shared/types` alias (also declared in tsconfig.json "paths").
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const sharedDir = path.resolve(projectRoot, '../src/lib');
const sharedTypes = path.join(sharedDir, 'types.ts');

const config = getDefaultConfig(projectRoot);

// Watch only the shared folder (not the whole repo root) so Metro does not crawl
// the web app's node_modules.
config.watchFolders = [...(config.watchFolders ?? []), sharedDir];

const upstreamResolve = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === '@shared/types') {
    return { type: 'sourceFile', filePath: sharedTypes };
  }
  return upstreamResolve
    ? upstreamResolve(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};

module.exports = config;

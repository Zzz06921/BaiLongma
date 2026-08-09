const path = require('path')
const fs = require('fs')

const PLAYWRIGHT_BROWSER_RESOURCE_DIR = 'playwright-browsers'

function packagedHostPlatform(platform = process.platform, arch = process.arch) {
  if (platform === 'win32' && arch === 'x64') return 'win64'
  if (platform === 'darwin' && arch === 'x64') return 'mac15'
  if (platform === 'darwin' && arch === 'arm64') return 'mac15-arm64'
  throw new Error(`Unsupported packaged Playwright target: ${platform}-${arch}`)
}

function packagedBrowserResourcePath(resourcesPath, platform = process.platform, arch = process.arch) {
  const basePath = path.join(resourcesPath, PLAYWRIGHT_BROWSER_RESOURCE_DIR)
  const archPath = path.join(basePath, arch)
  if (platform === 'darwin' && (arch === 'x64' || arch === 'arm64') && fs.existsSync(archPath)) {
    return archPath
  }
  return basePath
}

function configurePackagedPlaywright({
  isPackaged,
  resourcesPath = process.resourcesPath,
  platform = process.platform,
  arch = process.arch,
  env = process.env,
} = {}) {
  if (!isPackaged) return null
  if (!resourcesPath) throw new Error('process.resourcesPath is unavailable in packaged mode')

  env.PLAYWRIGHT_BROWSERS_PATH ||= packagedBrowserResourcePath(resourcesPath, platform, arch)
  env.BAILONGMA_BUNDLED_PLAYWRIGHT = '1'
  env.PLAYWRIGHT_HOST_PLATFORM_OVERRIDE ||= packagedHostPlatform(platform, arch)
  return env.PLAYWRIGHT_BROWSERS_PATH
}

module.exports = {
  PLAYWRIGHT_BROWSER_RESOURCE_DIR,
  configurePackagedPlaywright,
  packagedBrowserResourcePath,
  packagedHostPlatform,
}

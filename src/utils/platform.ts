export function isMacPlatform(): boolean {
  return /Mac/.test(navigator.platform);
}

export function isWindowsPlatform(): boolean {
  return /Win/.test(navigator.platform);
}

export function isLinuxPlatform(): boolean {
  return /Linux/.test(navigator.platform);
}

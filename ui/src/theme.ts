export type ThemePreference = 'system' | 'light' | 'dark'
export type Theme = 'light' | 'dark'

export const THEME_PREFERENCES: readonly ThemePreference[] = ['system', 'light', 'dark']

/** The theme actually shown, given the user's choice and whether Windows is in dark mode. */
export function resolveTheme(preference: ThemePreference, systemPrefersDark: boolean): Theme {
  if (preference === 'system') {
    return systemPrefersDark ? 'dark' : 'light'
  }
  return preference
}

/** Points the CSS tokens at a theme. "system" removes the override so the media query decides. */
export function applyTheme(preference: ThemePreference, root: HTMLElement = document.documentElement): void {
  if (preference === 'system') {
    root.removeAttribute('data-theme')
    return
  }
  root.setAttribute('data-theme', preference)
}

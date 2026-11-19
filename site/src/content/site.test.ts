import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import * as site from './site'
import { tapeBars } from './tape'

const tauriConf = JSON.parse(readFileSync(fileURLToPath(new URL('../../../app/tauri.conf.json', import.meta.url)), 'utf8')) as {
  version: string
}

// every string the page shows, gathered from the content module
function allCopy(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap(allCopy)
  if (value !== null && typeof value === 'object') return Object.values(value).flatMap(allCopy)
  return []
}

const copy = allCopy(Object.values(site)).filter((text) => !text.startsWith('http') && !text.startsWith('/') && !text.startsWith('#'))

describe('release facts', () => {
  it('matches the app version in tauri.conf.json', () => {
    expect(site.VERSION).toBe(tauriConf.version)
  })

  it('downloads the installer of that version from the GitHub release', () => {
    expect(site.DOWNLOAD_URL).toBe(`https://github.com/ZHANGV25/ringpad/releases/download/v${site.VERSION}/Ringpad_${site.VERSION}_x64-setup.exe`)
  })

  it('prints the installer size in megabytes with one decimal', () => {
    expect(site.formatMegabytes(3_626_703)).toBe('3.6 MB')
    expect(site.formatMegabytes(12_050_000)).toBe('12.1 MB')
    expect(site.CLOSER.smallPrint).toContain(`Version ${site.VERSION}, 3.6 MB.`)
  })

  it('links every footer and nav entry somewhere real', () => {
    for (const link of site.FOOTER_LINKS) expect(link.href).toMatch(/^https:\/\/github\.com\/ZHANGV25\/ringpad/)
    for (const link of site.NAV_LINKS) expect(link.href).toMatch(/^#[a-z]+$/)
  })
})

describe('copy rules', () => {
  it('has copy to check', () => {
    expect(copy.length).toBeGreaterThan(40)
  })

  it('uses no em or en dashes', () => {
    for (const text of copy) expect(text, text).not.toMatch(/[–—]/)
  })

  it('avoids the words that make copy sound machine-written', () => {
    const banned = /\b(seamless(ly)?|effortless(ly)?|unleash|elevate|supercharge|game-?changer|revolutionary|cutting-edge|delve|leverage|robust|empower|harness|boost)\b/i
    for (const text of copy) expect(text, text).not.toMatch(banned)
  })

  it('does not promise that a game accepts the talk key', () => {
    for (const text of copy) expect(text, text).not.toMatch(/valorant/i)
  })

  it('gives every step picture and the demo a description', () => {
    for (const step of site.STEPS) expect(step.alt.length).toBeGreaterThan(30)
    expect(site.SCREEN.alt.length).toBeGreaterThan(30)
  })
})

describe('tapeBars', () => {
  it('draws the same tape on every build', () => {
    expect(tapeBars(60)).toEqual(tapeBars(60))
  })

  it('keeps every bar between a sliver and full height', () => {
    const bars = tapeBars(120)
    expect(bars).toHaveLength(120)
    for (const height of bars) {
      expect(height).toBeGreaterThanOrEqual(0.08)
      expect(height).toBeLessThanOrEqual(1)
    }
  })

  it('returns nothing for no bars', () => {
    expect(tapeBars(0)).toEqual([])
  })
})

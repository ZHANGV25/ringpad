import { describe, expect, it } from 'vitest'
import { KEY_NAMES, isValidKeyName, keyLabel } from './keys'

describe('keys', () => {
  it('labels common key groups', () => {
    expect(keyLabel('f8')).toBe('F8')
    expect(keyLabel('a')).toBe('A')
    expect(keyLabel('1')).toBe('1')
    expect(keyLabel('num1')).toBe('Num 1')
    expect(keyLabel('pageup')).toBe('Page Up')
    expect(keyLabel('lshift')).toBe('Left Shift')
    expect(keyLabel('mouse5')).toBe('Mouse 5 (upper side)')
    expect(keyLabel('mouse4')).toBe('Mouse 4 (lower side)')
    expect(keyLabel('mouse3')).toBe('Middle click')
    expect(keyLabel('vk7c')).toBe('VK 0x7C')
    expect(keyLabel('custom')).toBe('custom')
  })

  it('validates every listed key and vk fallbacks', () => {
    KEY_NAMES.forEach((name) => expect(isValidKeyName(name)).toBe(true))
    expect(isValidKeyName('vk7c')).toBe(true)
    expect(isValidKeyName('vkzz')).toBe(false)
    expect(isValidKeyName('f25')).toBe(false)
  })
})

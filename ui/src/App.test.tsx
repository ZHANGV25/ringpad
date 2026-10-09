import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { App } from './App'

afterEach(() => {
  cleanup()
  document.documentElement.removeAttribute('data-theme')
})

describe('App', () => {
  it('shows the name and starts by following the Windows theme', () => {
    render(<App />)
    expect(screen.getByText('Ringpad')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'System' }).getAttribute('aria-pressed')).toBe('true')
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
  })

  it('switches theme when a theme button is pressed', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Dark' }))
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    expect(screen.getByRole('button', { name: 'Dark' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'System' }))
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
  })
})

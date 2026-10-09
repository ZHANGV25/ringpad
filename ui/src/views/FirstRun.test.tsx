import { describe, expect, it } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import type { DeviceInfo } from '../engine/types'
import { makeApi, noCableDevices, renderApp } from '../test/render'
import { setupMood } from './FirstRun'

function guideMood(): string | undefined {
  return document.querySelector<SVGSVGElement>('.setup-guide svg.panda')?.dataset.mood
}

function next(name: string | RegExp = 'Continue') {
  fireEvent.click(screen.getByRole('button', { name }))
}

function withCable(kind: DeviceInfo['virtualCable']): DeviceInfo[] {
  return [...noCableDevices(), { id: 'cable', name: 'Some cable', direction: 'output', isDefault: false, virtualCable: kind }]
}

describe('first run', () => {
  it('walks through all four steps and lands on the main window', async () => {
    const api = await renderApp(makeApi({ firstRunDone: false }))
    expect(screen.getByText('1 of 4')).toBeTruthy()
    expect(screen.getByText('Your virtual mic')).toBeTruthy()
    expect(screen.getByText(/Found VB-CABLE/)).toBeTruthy()
    expect(guideMood()).toBe('happy')
    expect((screen.getByRole('button', { name: /Back/ }) as HTMLButtonElement).disabled).toBe(true)

    next()
    expect(screen.getByText('Test it')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Play test tone' }))
    await waitFor(() => expect(screen.getByRole('meter', { name: 'Out' }).getAttribute('aria-valuenow')).toBe('92'))
    fireEvent.click(screen.getByRole('button', { name: /Back/ }))
    expect(screen.getByText('Your virtual mic')).toBeTruthy()

    next()
    next()
    expect(screen.getByText('What to record')).toBeTruthy()
    expect(screen.getByText(/keeps the last 30 s/)).toBeTruthy()
    expect(screen.getByRole('combobox', { name: 'Record from' })).toBeTruthy()

    next()
    expect(screen.getByText('Your keys')).toBeTruthy()
    expect(screen.getByText('Grab the last 5 s, preview it to you')).toBeTruthy()
    expect(screen.getAllByRole('button', { name: 'Change' })).toHaveLength(5)

    next('Start using Ringpad')
    expect(guideMood()).toBe('celebrate')
    expect((screen.getByRole('button', { name: 'Start using Ringpad' }) as HTMLButtonElement).disabled).toBe(true)
    expect(await screen.findByText('No clip yet', undefined, { timeout: 3000 })).toBeTruthy()
    expect((await api.getSnapshot()).settings.firstRunDone).toBe(true)
  })

  it('lets you skip the cable step when no cable is installed', async () => {
    await renderApp(makeApi({ firstRunDone: false, devices: noCableDevices() }))
    expect(screen.getByText('No virtual cable found')).toBeTruthy()
    expect(guideMood()).toBe('confused')
    next('Skip for now')
    expect(screen.getByText('Test it')).toBeTruthy()
  })

  it('names the cable it found', async () => {
    await renderApp(makeApi({ firstRunDone: false, devices: withCable('voicemod') }))
    expect(screen.getByText(/Found Voicemod/)).toBeTruthy()
  })

  it('falls back to a generic name for other cables', async () => {
    await renderApp(makeApi({ firstRunDone: false, devices: withCable('other') }))
    expect(screen.getByText(/Found a virtual cable/)).toBeTruthy()
  })

  it('picks a mood for each step', () => {
    const seen = { cableFound: true, finishing: false, toneOn: false }
    expect(setupMood(0, seen)).toBe('happy')
    expect(setupMood(0, { ...seen, cableFound: false })).toBe('confused')
    expect(setupMood(1, seen)).toBe('idle')
    expect(setupMood(1, { ...seen, toneOn: true })).toBe('talking')
    expect(setupMood(2, seen)).toBe('listening')
    expect(setupMood(3, seen)).toBe('happy')
    expect(setupMood(3, { ...seen, finishing: true })).toBe('celebrate')
  })
})

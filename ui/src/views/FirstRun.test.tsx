import { describe, expect, it } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { makeApi, noCableDevices, renderApp } from '../test/render'

function press(name: string | RegExp) {
  fireEvent.click(screen.getByRole('button', { name }))
}

describe('first run', () => {
  it('opens on a title screen with the panda waving', async () => {
    await renderApp(makeApi({ firstRunDone: false }))
    expect(screen.getByRole('heading', { name: 'Ringpad' })).toBeTruthy()
    expect(screen.getByRole('img', { name: "Ringpad's panda, waving" })).toBeTruthy()
    expect(screen.getByText('Clip what you just heard. Play it to your team.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Start' }).className).toMatch(/primary/)
  })

  it('skips the install when a virtual mic is already there, and lands on the main window', async () => {
    const api = await renderApp(makeApi({ firstRunDone: false }))
    press('Start')
    expect(screen.getByRole('heading', { name: 'Pick the mic' })).toBeTruthy()
    expect(screen.getByText('CABLE Output (VB-Audio Virtual Cable)')).toBeTruthy()
    expect(screen.getByText(/Settings › Voice & Video › Input Device/)).toBeTruthy()
    expect(screen.getByText('Same page: turn off Noise Suppression and Echo Cancellation.')).toBeTruthy()
    expect(screen.getByText(/Settings › Audio › Voice Chat › Input Device/)).toBeTruthy()
    expect(screen.getByText('Your friends still hear your voice.')).toBeTruthy()
    // The panda only appears on the title screen.
    expect(document.querySelector('.setup-body .panda')).toBeNull()

    press('Play a test sound')
    await waitFor(() => expect(screen.getByRole('meter', { name: 'Teammates hear' }).getAttribute('aria-valuenow')).toBe('99'))

    press('Next')
    expect(screen.getByRole('heading', { name: 'Your keys' })).toBeTruthy()
    expect(screen.getByText('Grab the last 5 seconds')).toBeTruthy()
    expect(screen.getByText('Play it to your team')).toBeTruthy()
    expect(screen.getAllByRole('button', { name: 'Change' })).toHaveLength(2)
    expect(screen.queryByRole('button', { name: /Clear/ })).toBeNull()

    press(/Back/)
    expect(screen.getByRole('heading', { name: 'Pick the mic' })).toBeTruthy()
    press('Next')
    press('Done')
    expect(await screen.findByText('Something funny just happened?')).toBeTruthy()
    expect((await api.getSnapshot()).settings.firstRunDone).toBe(true)
  })

  it('starts with the install when there is no virtual mic, and lets you skip it', async () => {
    await renderApp(makeApi({ firstRunDone: false, devices: noCableDevices() }))
    press('Start')
    expect(screen.getByRole('heading', { name: 'Add the mic' })).toBeTruthy()
    expect(screen.getByText('Windows will ask. Click Yes.')).toBeTruthy()
    // Installing is the thing to do here, so skipping is not styled as the main action.
    expect(screen.getByRole('button', { name: 'Install VB-CABLE' }).className).toMatch(/primary/)
    expect(screen.getByRole('button', { name: 'Skip' }).className).not.toMatch(/primary/)

    // Skipping the mic skips picking it too.
    press('Skip')
    expect(screen.getByRole('heading', { name: 'Your keys' })).toBeTruthy()
    press(/Back/)
    expect(screen.getByText('Add the mic first. Go back, or do it later in Settings.')).toBeTruthy()
    press(/Back/)
    press(/Back/)
    expect(screen.getByRole('heading', { name: 'Ringpad' })).toBeTruthy()
  })

  it("doesn't promise your voice gets through when the mic is off in Ringpad", async () => {
    await renderApp(makeApi({ firstRunDone: false, settings: { micEnabled: false } }))
    press('Start')
    expect(screen.queryByText('Your friends still hear your voice.')).toBeNull()
  })
})

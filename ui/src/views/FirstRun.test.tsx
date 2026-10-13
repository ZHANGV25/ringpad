import { describe, expect, it } from 'vitest'
import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import type { FakeEngineApi } from '../engine/fakeApi'
import type { MicUser } from '../engine/types'
import { makeApi, noCableDevices, renderApp } from '../test/render'
import { joinNames } from './setup/PickMic'

function press(name: string | RegExp) {
  fireEvent.click(screen.getByRole('button', { name }))
}

const discordOn = (mic: string, ringpad: boolean): MicUser => ({ pid: 7, exe: 'Discord.exe', name: 'Discord', mic, ringpad })

async function openPickStep(api: FakeEngineApi): Promise<FakeEngineApi> {
  await renderApp(api)
  press('Start')
  return api
}

describe('first run', () => {
  it('opens on a title screen with the panda waving', async () => {
    await renderApp(makeApi({ firstRunDone: false }))
    expect(screen.getByRole('heading', { name: 'Ringpad' })).toBeTruthy()
    expect(screen.getByRole('img', { name: "Ringpad's panda, waving" })).toBeTruthy()
    expect(screen.getByText('Clip what you just heard. Play it to your team.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Start' }).className).toMatch(/primary/)
  })

  it('shows the setting to change and waits for Discord to use it', async () => {
    await openPickStep(makeApi({ firstRunDone: false }))
    expect(screen.getByRole('heading', { name: 'Use Ringpad’s mic' })).toBeTruthy()
    expect(screen.getByText('Discord › Settings › Voice & Video')).toBeTruthy()
    expect(screen.getByText('CABLE Output (VB-Audio Virtual Cable)')).toBeTruthy()
    expect(screen.getByText('Noise suppression')).toBeTruthy()
    expect(screen.getByRole('status').textContent).toMatch(/Waiting for Discord… Join a voice channel so Ringpad can check./)
    expect(screen.getByText('Your voice goes through it too.')).toBeTruthy()
    // The panda only appears on the title screen.
    expect(document.querySelector('.setup-body .panda')).toBeNull()
    // Moving on before it works is allowed, but isn't the main action.
    expect(screen.getByRole('button', { name: 'Skip for now' }).className).not.toMatch(/primary/)
  })

  it('ticks itself off once Discord uses Ringpad’s mic, then teaches the keys by trying them', async () => {
    const api = makeApi({ firstRunDone: false })
    api.micApps = [discordOn('CABLE Output (VB-Audio Virtual Cable)', true)]
    await openPickStep(api)
    expect(await screen.findByText('Discord can hear Ringpad')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Next' }).className).toMatch(/primary/)

    press('Next')
    expect(screen.getByRole('heading', { name: 'Your keys' })).toBeTruthy()
    expect(screen.getByText('Grabs the last 5 seconds.')).toBeTruthy()
    expect(screen.getAllByRole('button', { name: 'Change' })).toHaveLength(2)
    expect(screen.queryByRole('button', { name: /Clear/ })).toBeNull()

    await act(async () => void (await api.grabClip()))
    expect(await screen.findByText('✓ Got it. You heard it back.')).toBeTruthy()
    expect(screen.getByText('Now press F7.')).toBeTruthy()
    await act(async () => void (await api.sendClip()))
    expect(await screen.findByText('✓ Your team heard it.')).toBeTruthy()

    press('Done')
    expect(await screen.findByRole('region', { name: 'Pads' })).toBeTruthy()
    expect((await api.getSnapshot()).settings.firstRunDone).toBe(true)
  })

  it('says which other mic Discord is on', async () => {
    const api = makeApi({ firstRunDone: false })
    api.micApps = [discordOn('Microphone (fifine Microphone)', false)]
    await openPickStep(api)
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe('Discord is using Microphone (fifine Microphone). Pick CABLE Output instead.'),
    )
  })

  it('opens on Valorant for a Valorant player and can hold the talk key during clips', async () => {
    const api = makeApi({
      firstRunDone: false,
      settings: { source: { kind: 'app', exe: 'VALORANT-Win64-Shipping.exe', name: 'Valorant' } },
    })
    await openPickStep(api)
    expect(screen.getByText('Valorant › Settings › Audio › Voice Chat')).toBeTruthy()
    expect(screen.getByRole('status').textContent).toMatch(/Waiting for Valorant…/)
    fireEvent.click(screen.getByRole('switch', { name: /Hold V for me while a clip plays/ }))
    await waitFor(async () => expect((await api.getSnapshot()).settings.pressTalkKeys).toBe('clips'))
  })

  it('starts with the install when there is no virtual mic, and lets you skip it', async () => {
    await renderApp(makeApi({ firstRunDone: false, devices: noCableDevices() }))
    press('Start')
    expect(screen.getByRole('heading', { name: 'Add the mic' })).toBeTruthy()
    expect(screen.getByText('Windows will ask. Click Yes.')).toBeTruthy()
    // Installing is the thing to do here, so skipping is not styled as the main action.
    expect(screen.getByRole('button', { name: 'Install VB-CABLE' }).className).toMatch(/primary/)
    expect(screen.getByRole('button', { name: 'Skip for now' }).className).not.toMatch(/primary/)

    // Skipping the mic skips picking it too.
    press('Skip for now')
    expect(screen.getByRole('heading', { name: 'Your keys' })).toBeTruthy()
    press(/Back/)
    expect(screen.getByText('Add the mic first. Go back, or do it later in Settings.')).toBeTruthy()
    press(/Back/)
    press(/Back/)
    expect(screen.getByRole('heading', { name: 'Ringpad' })).toBeTruthy()
  })

  it("doesn't promise your voice gets through when the mic is off in Ringpad", async () => {
    await openPickStep(makeApi({ firstRunDone: false, settings: { micEnabled: false } }))
    expect(screen.queryByText('Your voice goes through it too.')).toBeNull()
  })

  it('joins names the way a sentence would', () => {
    expect(joinNames(['Discord'])).toBe('Discord')
    expect(joinNames(['Discord', 'Valorant'])).toBe('Discord and Valorant')
    expect(joinNames(['A', 'B', 'C'])).toBe('A, B and C')
    expect(joinNames([])).toBe('')
  })
})

import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import type { FakeEngineApi } from '../engine/fakeApi'
import type { DeviceInfo } from '../engine/types'
import { makeApi, noCableDevices, renderApp } from '../test/render'
import { playbackSide } from './CableInstall'

const voicemodOnly: DeviceInfo[] = [
  ...noCableDevices(),
  { id: 'voicemod-output', name: 'Voicemod Virtual Audio Device', direction: 'output', isDefault: false, virtualCable: 'voicemod' },
]

async function openAudioSettings(api: FakeEngineApi): Promise<FakeEngineApi> {
  await renderApp(api)
  fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
  return api
}

/** Holds the install open until `release` is called, as Windows' prompts would. */
function holdInstall(api: FakeEngineApi): () => void {
  const original = api.installVirtualMic.bind(api)
  let release = () => undefined as void
  vi.spyOn(api, 'installVirtualMic').mockImplementation(
    () =>
      new Promise((resolve) => {
        release = () => resolve(original())
      }),
  )
  return () => release()
}

describe('installing VB-CABLE', () => {
  it('installs the bundled cable and starts playing into it', async () => {
    const api = await openAudioSettings(makeApi({ devices: noCableDevices() }))
    const update = vi.spyOn(api, 'updateSettings')
    const release = holdInstall(api)
    fireEvent.click(screen.getByRole('button', { name: 'Install VB-CABLE' }))

    const busy = screen.getByRole('button', { name: 'Installing…' }) as HTMLButtonElement
    expect(busy.disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Check again' }) as HTMLButtonElement).disabled).toBe(true)
    // Said before the click, because Windows' prompt covers the app while it shows.
    expect(screen.getByText('Windows will ask. Click Yes.')).toBeTruthy()
    expect(screen.getByRole('status').textContent).toBe('')

    await act(async () => release())
    expect(await screen.findByRole('combobox', { name: 'Virtual mic' })).toBeTruthy()
    expect(screen.queryByText('No virtual mic yet')).toBeNull()
    expect(update).toHaveBeenCalledWith({ patch: { virtualOutput: 'vb-output' } })
    expect(screen.getByText('CABLE Output (VB-Audio Virtual Cable)')).toBeTruthy()
  })

  it('says what to do when Windows was told no', async () => {
    const api = await openAudioSettings(makeApi({ devices: noCableDevices() }))
    api.nextCableInstall = 'declined'
    fireEvent.click(screen.getByRole('button', { name: 'Install VB-CABLE' }))
    expect(await screen.findByText('Windows needs a Yes. Try again.')).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Install VB-CABLE' }) as HTMLButtonElement).disabled).toBe(false)
    expect(screen.getByText('No virtual mic yet')).toBeTruthy()
  })

  it('asks for a restart when Windows has not listed the cable yet', async () => {
    const api = await openAudioSettings(makeApi({ devices: noCableDevices() }))
    api.nextCableInstall = 'needsRestart'
    fireEvent.click(screen.getByRole('button', { name: 'Install VB-CABLE' }))
    expect(await screen.findByText('Restart your PC to finish.')).toBeTruthy()
  })

  it('shows a failure next to the button and lets you try again', async () => {
    const api = await openAudioSettings(makeApi({ devices: noCableDevices() }))
    api.nextCableInstall = new Error("This copy of Ringpad is missing VB-CABLE's setup.")
    fireEvent.click(screen.getByRole('button', { name: 'Install VB-CABLE' }))
    expect(await screen.findByText(/missing VB-CABLE's setup/)).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Install VB-CABLE' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it("credits VB-Audio and links to VB-CABLE's page", async () => {
    const api = await openAudioSettings(makeApi({ devices: noCableDevices() }))
    expect(screen.getByText(/VB-CABLE is a donationware, all participations are welcome/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'www.vb-cable.com' }))
    await waitFor(() => expect(api.openedUrl).toBe('https://vb-audio.com/Cable/'))
    const list = vi.spyOn(api, 'listDevices')
    fireEvent.click(screen.getByRole('button', { name: 'Check again' }))
    expect(list).toHaveBeenCalledOnce()
  })

  it('offers VB-CABLE in place of another cable, then stops offering it', async () => {
    const api = await openAudioSettings(makeApi({ devices: voicemodOnly, settings: { virtualOutput: 'voicemod-output' } }))
    fireEvent.click(screen.getByRole('button', { name: 'Install VB-CABLE instead' }))
    await waitFor(async () => expect((await api.getSnapshot()).settings.virtualOutput).toBe('vb-output'))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Install VB-CABLE instead' })).toBeNull())
  })

  it('does not offer VB-CABLE when it is already there', async () => {
    await openAudioSettings(makeApi())
    expect(screen.queryByRole('button', { name: /Install VB-CABLE/ })).toBeNull()
  })

  it('names VB-Audio on the About page', async () => {
    await openAudioSettings(makeApi())
    fireEvent.click(screen.getByRole('tab', { name: 'About' }))
    expect(screen.getByText(/Ringpad can install VB-CABLE for you/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'www.vb-cable.com' })).toBeTruthy()
  })

  it('finishes the first setup step once the cable is in', async () => {
    await renderApp(makeApi({ firstRunDone: false, devices: noCableDevices() }))
    fireEvent.click(screen.getByRole('button', { name: 'Start' }))
    expect(screen.getByRole('button', { name: 'Skip' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Install VB-CABLE' }))
    expect(await screen.findByText('Installed')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Next' }).className).toMatch(/primary/)
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByText('CABLE Output (VB-Audio Virtual Cable)')).toBeTruthy()
  })
})

describe('playbackSide', () => {
  const cable = (id: string, name: string, direction: DeviceInfo['direction'] = 'output'): DeviceInfo => ({
    id,
    name,
    direction,
    isDefault: false,
    virtualCable: 'vbcable',
  })

  it("picks VB-CABLE's input, which is where Ringpad plays", () => {
    const devices = [cable('out', 'CABLE Output (VB-Audio Virtual Cable)', 'input'), cable('a', 'VB-Audio Virtual Cable'), cable('in', 'CABLE Input (VB-Audio Virtual Cable)')]
    expect(playbackSide(devices)?.id).toBe('in')
    expect(playbackSide(devices.slice(0, 2))?.id).toBe('a')
    expect(playbackSide(noCableDevices())).toBeUndefined()
  })
})

import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import type { FakeEngineApi } from '../engine/fakeApi'
import type { Settings } from '../engine/types'
import { makeApi, noCableDevices, renderApp, withPads } from '../test/render'

async function openSettings(api: FakeEngineApi = makeApi()): Promise<FakeEngineApi> {
  await renderApp(api)
  fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
  return api
}

function openTab(name: string) {
  fireEvent.click(within(screen.getByRole('tablist', { name: 'Settings sections' })).getByRole('tab', { name }))
}

async function settingsOf(api: FakeEngineApi): Promise<Settings> {
  return (await api.getSnapshot()).settings
}

function row(label: string): HTMLElement {
  const rows = screen.getAllByText(label, { selector: '.hotkey-name > span:first-child' })
  return rows[0]?.closest('.hotkey-row') as HTMLElement
}

describe('settings tabs', () => {
  it('has four tabs named by task, opens on Mic, and goes back', async () => {
    await openSettings()
    const tabs = screen.getByRole('tablist', { name: 'Settings sections' })
    expect(within(tabs).getAllByRole('tab').map((item) => item.textContent)).toEqual(['Mic', 'Clips', 'Keys', 'App'])
    expect(within(tabs).getByRole('tab', { name: 'Mic' }).getAttribute('aria-selected')).toBe('true')

    fireEvent.keyDown(tabs, { key: 'ArrowLeft' })
    expect(within(tabs).getByRole('tab', { name: 'App' }).getAttribute('aria-selected')).toBe('true')
    fireEvent.keyDown(tabs, { key: 'ArrowRight' })
    expect(within(tabs).getByRole('tab', { name: 'Mic' }).getAttribute('aria-selected')).toBe('true')

    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(screen.getByRole('region', { name: 'Pads' })).toBeTruthy()
  })
})

describe('mic tab', () => {
  it('shows the setting to change in your app and checks it live', async () => {
    const api = makeApi()
    api.micApps = [{ pid: 7, exe: 'Discord.exe', name: 'Discord', mic: 'CABLE Output (VB-Audio Virtual Cable)', ringpad: true }]
    await openSettings(api)
    expect(screen.getByText('Discord › Settings › Voice & Video')).toBeTruthy()
    expect(await screen.findByText('Discord can hear Ringpad')).toBeTruthy()
    // Settings has its own place for the game's talk key, so the guide leaves it out.
    fireEvent.click(screen.getByRole('tab', { name: 'Valorant' }))
    expect(screen.queryByRole('switch', { name: /Hold V for me/ })).toBeNull()
  })

  it('offers to install VB-CABLE when there is no virtual cable', async () => {
    await openSettings(makeApi({ devices: noCableDevices() }))
    expect(screen.getByText('No virtual mic yet')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Install VB-CABLE' })).toBeTruthy()
    expect(screen.queryByText('Virtual cable')).toBeNull()
  })

  it('warns when Windows plays everything into the cable', async () => {
    const devices = (await makeApi().listDevices()).map((device) => ({ ...device, isDefault: device.direction === 'output' ? Boolean(device.virtualCable) : device.isDefault }))
    await openSettings(makeApi({ devices }))
    expect(screen.getByRole('alert').textContent).toMatch(/Windows is playing all sound into Ringpad’s mic/)
  })

  it('keeps the cable picker folded away', async () => {
    const api = await openSettings()
    fireEvent.click(screen.getByText('Virtual cable'))
    fireEvent.change(screen.getByRole('combobox', { name: 'Virtual mic' }), { target: { value: 'voicemod-output' } })
    await waitFor(async () => expect((await settingsOf(api)).virtualOutput).toBe('voicemod-output'))
  })

  it('plays a test sound and shows it on the meter beside it', async () => {
    await openSettings()
    fireEvent.click(screen.getByRole('button', { name: 'Play a test sound' }))
    const meters = screen.getAllByRole('meter', { name: 'What your team hears' })
    await waitFor(() => expect(meters.map((meter) => meter.getAttribute('aria-valuenow'))).toContain('99'))
  })

  it('sends your voice too, from the mic you pick, and quiets it during clips', async () => {
    const api = await openSettings()
    const mic = screen.getByRole('combobox', { name: 'Mic device' })
    fireEvent.change(mic, { target: { value: 'mic' } })
    await waitFor(async () => expect((await settingsOf(api)).mic).toBe('mic'))
    fireEvent.change(mic, { target: { value: '' } })
    await waitFor(async () => expect((await settingsOf(api)).mic).toBeNull())
    fireEvent.click(screen.getByRole('switch', { name: /Quiet my mic during clips/ }))
    await waitFor(async () => expect((await settingsOf(api)).ducking).toBe(false))

    fireEvent.click(screen.getByRole('switch', { name: /Send my voice too/ }))
    await waitFor(async () => expect((await settingsOf(api)).micEnabled).toBe(false))
    // With your voice off, the rest of its settings step aside.
    expect(screen.queryByRole('combobox', { name: 'Mic device' })).toBeNull()
    expect(screen.queryByRole('tab', { name: 'Hold a key' })).toBeNull()
  })

  it('writes the voice mode and asks for a talk key', async () => {
    const api = await openSettings()
    const update = vi.spyOn(api, 'updateSettings')
    fireEvent.click(screen.getByRole('tab', { name: 'Hold a key' }))
    await waitFor(async () => expect((await settingsOf(api)).micMode).toBe('pushToTalk'))
    expect(update).toHaveBeenLastCalledWith({ patch: { micMode: 'pushToTalk' } })
    expect(screen.getByText('Pick a talk key. Until then your voice stays off.')).toBeTruthy()
    expect(screen.getByText('Clips always play. Set Discord or your game to voice activity.')).toBeTruthy()

    fireEvent.click(screen.getByRole('tab', { name: 'Always on' }))
    fireEvent.click(screen.getByRole('tab', { name: 'Clips and my voice' }))
    await waitFor(() => expect(screen.getByText('Pick Hold a key or Press to toggle above for your voice to count.')).toBeTruthy())
  })

  it('sets the talk key with the existing key capture flow', async () => {
    const api = await openSettings(makeApi({ settings: { micMode: 'pushToTalk' } }))
    fireEvent.click(within(row('Talk key')).getByRole('button', { name: 'Change' }))
    expect(within(row('Talk key')).getByText('Press a key')).toBeTruthy()
    act(() => api.simulateKey('t'))
    await waitFor(async () => expect((await settingsOf(api)).hotkeys.talk).toBe('t'))
    expect(within(row('Talk key')).getByText('T')).toBeTruthy()
  })
})

describe('game talk key', () => {
  async function openGameKeys(api: FakeEngineApi = makeApi()): Promise<FakeEngineApi> {
    const opened = await openSettings(api)
    fireEvent.click(screen.getByRole('tab', { name: 'During clips' }))
    return opened
  }

  it('adds and removes game keys with a three-key limit', async () => {
    const api = await openGameKeys()
    expect((screen.getByRole('button', { name: 'Remove V' }) as HTMLButtonElement).disabled).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'Add key' }))
    act(() => api.simulateKey('b'))
    await waitFor(async () => expect((await settingsOf(api)).gameTalkKeys).toEqual(['v', 'b']))
    expect((screen.getByRole('button', { name: 'Remove V' }) as HTMLButtonElement).disabled).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: 'Remove V' }))
    await waitFor(async () => expect((await settingsOf(api)).gameTalkKeys).toEqual(['b']))
    expect((screen.getByRole('button', { name: 'Remove B' }) as HTMLButtonElement).disabled).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'Add key' }))
    act(() => api.simulateKey('c'))
    fireEvent.click(await screen.findByRole('button', { name: 'Add key' }))
    act(() => api.simulateKey('d'))
    await waitFor(async () => expect((await settingsOf(api)).gameTalkKeys).toEqual(['b', 'c', 'd']))
    expect(screen.queryByRole('button', { name: 'Add key' })).toBeNull()
  })

  it('keeps the timing folded away and writes it', async () => {
    const api = await openGameKeys(makeApi({ settings: { talkOnlyApp: 'ClosedGame.exe' } }))
    fireEvent.click(screen.getByText('Timing'))
    fireEvent.change(screen.getByRole('slider', { name: 'Head start' }), { target: { value: '220' } })
    fireEvent.change(screen.getByRole('slider', { name: 'Release delay' }), { target: { value: '600' } })
    await waitFor(async () => expect(await settingsOf(api)).toMatchObject({ talkLeadMs: 220, talkTailMs: 600 }))
    expect(screen.getByText('220 ms')).toBeTruthy()

    const select = screen.getByRole('combobox', { name: 'Only when this app is in front' }) as HTMLSelectElement
    expect(await within(select).findByRole('option', { name: 'Discord' })).toBeTruthy()
    expect(within(select).getByRole('option', { name: 'ClosedGame.exe' })).toBeTruthy()
    fireEvent.change(select, { target: { value: 'VALORANT-Win64-Shipping.exe' } })
    await waitFor(async () => expect((await settingsOf(api)).talkOnlyApp).toBe('VALORANT-Win64-Shipping.exe'))
    fireEvent.change(select, { target: { value: '' } })
    await waitFor(async () => expect((await settingsOf(api)).talkOnlyApp).toBeNull())
  })

  it('tests the game keys, shows holding text and blocked errors', async () => {
    const api = await openGameKeys()
    const test = vi.spyOn(api, 'testTalkKeys')
    fireEvent.click(screen.getByRole('button', { name: 'Test' }))
    expect(test).toHaveBeenCalledOnce()
    expect(await screen.findByText('Holding V')).toBeTruthy()
    act(() => api.simulateTalkBlocked('Windows blocked VALORANT. Run Ringpad as administrator.'))
    expect(screen.getByRole('alert').textContent).toBe('Windows blocked VALORANT. Run Ringpad as administrator.')
    api.dispose()
  })
})

describe('clips tab', () => {
  it('clips from an app, a device or everything', async () => {
    const api = await openSettings()
    openTab('Clips')
    const source = screen.getByRole('combobox', { name: 'Record from' }) as HTMLSelectElement
    await waitFor(() => expect(within(source).getByRole('option', { name: '● Discord' })).toBeTruthy())
    expect(within(source).getByRole('option', { name: 'VALORANT' })).toBeTruthy()

    fireEvent.change(source, { target: { value: 'app:Discord.exe' } })
    await waitFor(async () => expect((await settingsOf(api)).source).toEqual({ kind: 'app', exe: 'Discord.exe', name: 'Discord' }))
    expect(screen.queryByRole('switch', { name: /Play it in my headphones/ })).toBeNull()
    fireEvent.change(source, { target: { value: 'device:speakers' } })
    await waitFor(async () => expect((await settingsOf(api)).source).toEqual({ kind: 'device', id: 'speakers' }))
    fireEvent.click(screen.getByRole('switch', { name: /Play it in my headphones/ }))
    await waitFor(async () => expect((await settingsOf(api)).relaySource).toBe(true))
    fireEvent.change(source, { target: { value: 'default' } })
    await waitFor(async () => expect((await settingsOf(api)).source).toEqual({ kind: 'default' }))
    expect(within(source).getByRole('option', { name: 'Everything I hear' })).toBeTruthy()

    const refresh = vi.spyOn(api, 'listAudioApps')
    fireEvent.click(screen.getByRole('button', { name: 'Refresh apps' }))
    expect(refresh).toHaveBeenCalledOnce()
  })

  it('keeps a saved app listed while it is closed', async () => {
    await openSettings(makeApi({ settings: { source: { kind: 'app', exe: 'Game.exe', name: 'Game' } } }))
    openTab('Clips')
    const source = screen.getByRole('combobox', { name: 'Record from' }) as HTMLSelectElement
    expect(await within(source).findByRole('option', { name: 'Game (not running)' })).toBeTruthy()
    expect(source.value).toBe('app:Game.exe')
  })

  it('changes lengths, volumes, headphones and how long clips are kept', async () => {
    const api = await openSettings()
    openTab('Clips')
    fireEvent.change(screen.getByRole('slider', { name: 'Each clip' }), { target: { value: '8' } })
    fireEvent.change(screen.getByRole('slider', { name: 'Keep the last' }), { target: { value: '60' } })
    fireEvent.change(screen.getByRole('slider', { name: 'Your team' }), { target: { value: '0.9' } })
    fireEvent.change(screen.getByRole('slider', { name: 'You' }), { target: { value: '0.3' } })
    fireEvent.change(screen.getByRole('combobox', { name: 'Headphones' }), { target: { value: 'speakers' } })
    fireEvent.change(screen.getByRole('combobox', { name: 'Keep clips for' }), { target: { value: '0' } })
    await waitFor(async () =>
      expect(await settingsOf(api)).toMatchObject({
        grabSeconds: 8,
        historySeconds: 60,
        sendVolume: 0.9,
        monitorVolume: 0.3,
        headphones: 'speakers',
        clipRetentionDays: 0,
      }),
    )
    expect(screen.getByText('60 s')).toBeTruthy()
    fireEvent.change(screen.getByRole('combobox', { name: 'Headphones' }), { target: { value: '' } })
    await waitFor(async () => expect((await settingsOf(api)).headphones).toBeNull())

    fireEvent.click(screen.getByRole('button', { name: 'Open clips folder' }))
    await waitFor(() => expect(api.clipsFolderOpened).toBe(true))
  })
})

describe('keys tab', () => {
  it('says what each key does and leaves the talk key to Mic', async () => {
    await openSettings()
    openTab('Keys')
    expect(within(row('Clip')).getByText('Grabs the last 5 s')).toBeTruthy()
    expect(within(row('Send')).getByText('Plays the clip to your team')).toBeTruthy()
    expect(screen.queryByText('Talk', { selector: '.hotkey-name > span:first-child' })).toBeNull()
    expect(screen.getByText('Fill a pad to give it a key.')).toBeTruthy()
  })

  it('binds a free key', async () => {
    const api = await openSettings()
    openTab('Keys')
    fireEvent.click(within(row('Clip')).getByRole('button', { name: 'Change' }))
    expect(within(row('Clip')).getByText('Press a key')).toBeTruthy()
    act(() => api.simulateKey('g'))
    await waitFor(async () => expect((await settingsOf(api)).hotkeys.grab).toBe('g'))
    expect(within(row('Clip')).getByText('G')).toBeTruthy()
  })

  it('asks before taking a key from another action', async () => {
    const api = await openSettings()
    openTab('Keys')
    fireEvent.click(within(row('Clip')).getByRole('button', { name: 'Change' }))
    act(() => api.simulateKey('f7'))
    expect(screen.getByText('F7 is used by Send. Use it here instead?')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect((await settingsOf(api)).hotkeys.grab).toBe('f8')

    fireEvent.click(within(row('Clip')).getByRole('button', { name: 'Change' }))
    act(() => api.simulateKey('f7'))
    fireEvent.click(screen.getByRole('button', { name: 'Replace' }))
    await waitFor(async () => expect((await settingsOf(api)).hotkeys).toMatchObject({ grab: 'f7', send: null }))
  })

  it('ignores Escape, cancels capture and clears a key', async () => {
    const api = await openSettings()
    openTab('Keys')
    const cancel = vi.spyOn(api, 'cancelKeyCapture')
    fireEvent.click(within(row('Stop')).getByRole('button', { name: 'Change' }))
    act(() => api.simulateKey('escape'))
    expect(cancel).not.toHaveBeenCalled()
    expect((await settingsOf(api)).hotkeys.stop).toBe('f9')

    fireEvent.click(within(row('Stop')).getByRole('button', { name: 'Change' }))
    fireEvent.click(within(row('Stop')).getByRole('button', { name: 'Cancel' }))
    expect(cancel).toHaveBeenCalledOnce()

    fireEvent.click(screen.getByRole('button', { name: 'Clear Stop hotkey' }))
    await waitFor(async () => expect((await settingsOf(api)).hotkeys.stop).toBeNull())
    expect((screen.getByRole('button', { name: 'Clear Stop hotkey' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('lists filled pads only, moving a key between a pad and an action', async () => {
    const api = await openSettings(await withPads(makeApi(), [0, 1]))
    openTab('Keys')
    expect(screen.queryByText('Pad 3', { selector: '.hotkey-name > span:first-child' })).toBeNull()

    fireEvent.click(within(row('Pad 1')).getByRole('button', { name: 'Change' }))
    act(() => api.simulateKey('f8'))
    expect(screen.getByText('F8 is used by Clip. Use it here instead?')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Replace' }))
    await waitFor(async () => {
      const snapshot = await api.getSnapshot()
      expect(snapshot.settings.hotkeys.grab).toBeNull()
      expect(snapshot.pads[0]?.hotkey).toBe('f8')
    })

    fireEvent.click(within(row('Save to pad')).getByRole('button', { name: 'Change' }))
    act(() => api.simulateKey('f2'))
    expect(screen.getByText('F2 is used by Pad 2. Use it here instead?')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Replace' }))
    await waitFor(async () => {
      const snapshot = await api.getSnapshot()
      expect(snapshot.settings.hotkeys.save).toBe('f2')
      expect(snapshot.pads[1]?.hotkey).toBeNull()
    })
  })

  it('names renamed pads and shows their slot as a hint', async () => {
    const api = await withPads(makeApi(), [0])
    await api.renamePad({ slot: 0, name: 'Nice' })
    await openSettings(api)
    openTab('Keys')
    expect(within(row('Nice')).getByText('Pad 1')).toBeTruthy()
  })
})

describe('app tab', () => {
  it('changes theme and startup, and shows what Ringpad is', async () => {
    const api = await openSettings()
    openTab('App')
    fireEvent.click(screen.getByRole('tab', { name: 'Dark' }))
    await waitFor(async () => expect((await settingsOf(api)).theme).toBe('dark'))
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')

    fireEvent.click(screen.getByRole('switch', { name: 'Start with Windows' }))
    fireEvent.click(screen.getByRole('switch', { name: /Start in the tray/ }))
    await waitFor(async () => expect(await settingsOf(api)).toMatchObject({ startWithWindows: true, startMinimized: true }))

    expect(screen.getByText('Version 0.1.0 · fake · MIT license')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Source on GitHub/ }))
    await waitFor(() => expect(api.openedUrl).toBe('https://github.com/ZHANGV25/ringpad'))
  })
})

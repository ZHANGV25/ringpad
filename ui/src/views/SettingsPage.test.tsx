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
  fireEvent.click(screen.getByRole('tab', { name }))
}

async function settingsOf(api: FakeEngineApi): Promise<Settings> {
  return (await api.getSnapshot()).settings
}

function row(label: string): HTMLElement {
  const rows = screen.getAllByText(label, { selector: '.hotkey-name > span:first-child' })
  return rows[0]?.closest('.hotkey-row') as HTMLElement
}

describe('settings tabs', () => {
  it('switches tabs by click and by arrow keys, and goes back', async () => {
    await openSettings()
    const tabs = screen.getByRole('tablist', { name: 'Settings sections' })
    expect(within(tabs).getAllByRole('tab').map((item) => item.textContent)).toEqual(['Audio', 'Talk', 'Hotkeys', 'Pads', 'General', 'About'])
    expect(screen.getByRole('tab', { name: 'Audio' }).getAttribute('aria-selected')).toBe('true')

    fireEvent.keyDown(tabs, { key: 'ArrowLeft' })
    expect(screen.getByRole('tab', { name: 'About' }).getAttribute('aria-selected')).toBe('true')
    fireEvent.keyDown(tabs, { key: 'ArrowRight' })
    expect(screen.getByRole('tab', { name: 'Audio' }).getAttribute('aria-selected')).toBe('true')
    fireEvent.keyDown(tabs, { key: 'Enter' })
    expect(screen.getByRole('tab', { name: 'Audio' }).getAttribute('aria-selected')).toBe('true')

    openTab('Pads')
    expect(screen.getByText('Drop an audio file on a pad in the main window, or save a clip to it.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(screen.getByText('Something funny just happened?')).toBeTruthy()
  })
})

describe('audio tab', () => {
  it('records from an app, a device or the default output', async () => {
    const api = await openSettings()
    const source = screen.getByRole('combobox', { name: 'Record from' }) as HTMLSelectElement
    await waitFor(() => expect(within(source).getByRole('option', { name: '● Discord' })).toBeTruthy())
    expect(within(source).getByRole('option', { name: 'VALORANT' })).toBeTruthy()

    fireEvent.change(source, { target: { value: 'app:Discord.exe' } })
    await waitFor(async () => expect((await settingsOf(api)).source).toEqual({ kind: 'app', exe: 'Discord.exe', name: 'Discord' }))
    expect(screen.queryByRole('switch', { name: /Play it in my headphones/ })).toBeNull()
    fireEvent.change(source, { target: { value: 'device:speakers' } })
    await waitFor(async () => expect((await settingsOf(api)).source).toEqual({ kind: 'device', id: 'speakers' }))
    expect(source.value).toBe('device:speakers')
    fireEvent.click(screen.getByRole('switch', { name: /Play it in my headphones/ }))
    await waitFor(async () => expect((await settingsOf(api)).relaySource).toBe(true))
    fireEvent.change(source, { target: { value: 'default' } })
    await waitFor(async () => expect((await settingsOf(api)).source).toEqual({ kind: 'default' }))

    const refresh = vi.spyOn(api, 'listAudioApps')
    fireEvent.click(screen.getByRole('button', { name: 'Refresh apps' }))
    expect(refresh).toHaveBeenCalledOnce()
  })

  it('keeps a saved app listed while it is closed', async () => {
    await openSettings(makeApi({ settings: { source: { kind: 'app', exe: 'Game.exe', name: 'Game' } } }))
    const source = screen.getByRole('combobox', { name: 'Record from' }) as HTMLSelectElement
    expect(await within(source).findByRole('option', { name: 'Game (not running)' })).toBeTruthy()
    expect(source.value).toBe('app:Game.exe')
  })

  it('picks the virtual cable and tells you what to choose in the game', async () => {
    const api = await openSettings()
    expect(screen.getByText('CABLE Output (VB-Audio Virtual Cable)')).toBeTruthy()
    fireEvent.change(screen.getByRole('combobox', { name: 'Virtual mic' }), { target: { value: 'voicemod-output' } })
    await waitFor(async () => expect((await settingsOf(api)).virtualOutput).toBe('voicemod-output'))
  })

  it('offers to install VB-CABLE when there is no virtual cable', async () => {
    await openSettings(makeApi({ devices: noCableDevices() }))
    expect(screen.getByText('No virtual mic yet')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Install VB-CABLE' })).toBeTruthy()
  })

  it('changes headphones, mic and levels', async () => {
    const api = await openSettings()
    fireEvent.change(screen.getByRole('combobox', { name: 'Headphones' }), { target: { value: '' } })
    await waitFor(async () => expect((await settingsOf(api)).headphones).toBeNull())
    fireEvent.change(screen.getByRole('combobox', { name: 'Headphones' }), { target: { value: 'speakers' } })
    await waitFor(async () => expect((await settingsOf(api)).headphones).toBe('speakers'))

    const mic = screen.getByRole('combobox', { name: 'Mic device' }) as HTMLSelectElement
    expect(mic.disabled).toBe(false)
    fireEvent.click(screen.getByRole('switch', { name: /Pass my mic through/ }))
    await waitFor(() => expect(mic.disabled).toBe(true))
    fireEvent.click(screen.getByRole('switch', { name: /Pass my mic through/ }))
    await waitFor(() => expect(mic.disabled).toBe(false))
    fireEvent.change(mic, { target: { value: 'mic' } })
    await waitFor(async () => expect((await settingsOf(api)).mic).toBe('mic'))
    fireEvent.change(mic, { target: { value: '' } })
    await waitFor(async () => expect((await settingsOf(api)).mic).toBeNull())
    fireEvent.click(screen.getByRole('switch', { name: /Lower my mic/ }))
    await waitFor(async () => expect((await settingsOf(api)).ducking).toBe(false))

    fireEvent.change(screen.getByRole('slider', { name: 'You hear' }), { target: { value: '0.3' } })
    fireEvent.change(screen.getByRole('slider', { name: 'Clip volume' }), { target: { value: '0.9' } })
    fireEvent.change(screen.getByRole('slider', { name: 'Keep the last' }), { target: { value: '60' } })
    fireEvent.change(screen.getByRole('slider', { name: 'Clip length' }), { target: { value: '8' } })
    await waitFor(async () =>
      expect(await settingsOf(api)).toMatchObject({ monitorVolume: 0.3, sendVolume: 0.9, historySeconds: 60, grabSeconds: 8 }),
    )
    expect(screen.getByText('60 s')).toBeTruthy()
  })

  it('plays a test tone and shows it on the teammates meter', async () => {
    await openSettings()
    fireEvent.click(screen.getByRole('button', { name: 'Play a test sound' }))
    await waitFor(() => expect(screen.getByRole('meter', { name: 'Teammates hear' }).getAttribute('aria-valuenow')).toBe('99'))
  })
})

describe('talk tab', () => {
  async function openTalk(api: FakeEngineApi = makeApi()): Promise<FakeEngineApi> {
    const opened = await openSettings(api)
    openTab('Talk')
    return opened
  }

  it('renders mic modes and writes the selected mode', async () => {
    const api = await openTalk()
    const update = vi.spyOn(api, 'updateSettings')
    fireEvent.click(screen.getByRole('tab', { name: 'Hold a key' }))
    await waitFor(async () => expect((await settingsOf(api)).micMode).toBe('pushToTalk'))
    expect(update).toHaveBeenLastCalledWith({ patch: { micMode: 'pushToTalk' } })
    expect(screen.getByText('Pick a talk key. Until then your mic stays off.')).toBeTruthy()
    expect(screen.getByText('Clips always play. Set Discord or your game to voice activity on the Ringpad cable.')).toBeTruthy()

    fireEvent.click(screen.getByRole('tab', { name: 'Press to toggle' }))
    fireEvent.click(screen.getByRole('tab', { name: 'Clips and my mic' }))
    await waitFor(() => expect(screen.getByText('Your talk key then works as a toggle for the game too.')).toBeTruthy())
    fireEvent.click(screen.getByRole('tab', { name: 'Always on' }))
    await waitFor(() => expect(screen.getByText('Choose Hold a key or Press to toggle above for your mic to count.')).toBeTruthy())
  })

  it('sets the talk key with the existing key capture flow', async () => {
    const api = await openTalk(makeApi({ settings: { micMode: 'pushToTalk' } }))
    fireEvent.click(within(row('Talk key')).getByRole('button', { name: 'Change' }))
    expect(within(row('Talk key')).getByText('Press a key')).toBeTruthy()
    act(() => api.simulateKey('t'))
    await waitFor(async () => expect((await settingsOf(api)).hotkeys.talk).toBe('t'))
    expect(within(row('Talk key')).getByText('T')).toBeTruthy()
  })

  it('adds and removes game keys with a three-key limit', async () => {
    const api = await openTalk()
    fireEvent.click(screen.getByRole('tab', { name: 'While a clip plays' }))
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

  it('writes lead and tail sliders', async () => {
    const api = await openTalk()
    fireEvent.click(screen.getByRole('tab', { name: 'While a clip plays' }))
    fireEvent.change(screen.getByRole('slider', { name: 'Head start' }), { target: { value: '220' } })
    fireEvent.change(screen.getByRole('slider', { name: 'Release delay' }), { target: { value: '600' } })
    await waitFor(async () => expect(await settingsOf(api)).toMatchObject({ talkLeadMs: 220, talkTailMs: 600 }))
    expect(screen.getByText('220 ms')).toBeTruthy()
    expect(screen.getByText('600 ms')).toBeTruthy()
  })

  it('lists apps for talk limiting and writes Any app as null', async () => {
    const api = await openTalk(makeApi({ settings: { talkOnlyApp: 'ClosedGame.exe' } }))
    fireEvent.click(screen.getByRole('tab', { name: 'While a clip plays' }))
    const select = screen.getByRole('combobox', { name: 'Only when this app is in front' }) as HTMLSelectElement
    expect(await within(select).findByRole('option', { name: 'Discord' })).toBeTruthy()
    expect(within(select).getByRole('option', { name: 'ClosedGame.exe' })).toBeTruthy()
    fireEvent.change(select, { target: { value: 'VALORANT-Win64-Shipping.exe' } })
    await waitFor(async () => expect((await settingsOf(api)).talkOnlyApp).toBe('VALORANT-Win64-Shipping.exe'))
    fireEvent.change(select, { target: { value: '' } })
    await waitFor(async () => expect((await settingsOf(api)).talkOnlyApp).toBeNull())
  })

  it('tests the game keys, shows holding text and blocked errors', async () => {
    const api = await openTalk()
    fireEvent.click(screen.getByRole('tab', { name: 'While a clip plays' }))
    const test = vi.spyOn(api, 'testTalkKeys')
    fireEvent.click(screen.getByRole('button', { name: 'Test' }))
    expect(test).toHaveBeenCalledOnce()
    expect(await screen.findByText('Holding V')).toBeTruthy()
    act(() => api.simulateTalkBlocked('Windows blocked VALORANT. Run Ringpad as administrator.'))
    expect(screen.getByRole('alert').textContent).toBe('Windows blocked VALORANT. Run Ringpad as administrator.')
    api.dispose()
  })
})

describe('hotkeys tab', () => {
  it('binds a free key', async () => {
    const api = await openSettings()
    openTab('Hotkeys')
    fireEvent.click(within(row('Clip')).getByRole('button', { name: 'Change' }))
    expect(within(row('Clip')).getByText('Press a key')).toBeTruthy()
    act(() => api.simulateKey('g'))
    await waitFor(async () => expect((await settingsOf(api)).hotkeys.grab).toBe('g'))
    expect(within(row('Clip')).getByText('G')).toBeTruthy()
  })

  it('asks before taking a key from another action', async () => {
    const api = await openSettings()
    openTab('Hotkeys')
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
    openTab('Hotkeys')
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

  it('binds pad keys, moving a key between a pad and an action', async () => {
    const api = await openSettings(await withPads(makeApi(), [0, 1]))
    openTab('Hotkeys')
    expect((within(row('Pad 3')).getByRole('button', { name: 'Change' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getAllByText('Empty: save a clip to this pad first')).toHaveLength(6)

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
    openTab('Hotkeys')
    expect(within(row('Nice')).getByText('Pad 1')).toBeTruthy()
  })
})

describe('pads tab', () => {
  it('lists pads, sets a volume and clears one', async () => {
    const api = await openSettings(await withPads(makeApi(), [0]))
    openTab('Pads')
    expect(screen.getAllByText('Empty')).toHaveLength(7)
    expect(screen.getByText('5.0 s')).toBeTruthy()
    fireEvent.change(screen.getByRole('slider', { name: 'Volume' }), { target: { value: '0.4' } })
    await waitFor(async () => expect((await api.getSnapshot()).pads[0]?.volume).toBe(0.4))
    fireEvent.click(screen.getByRole('button', { name: 'Clear Pad 1' }))
    await waitFor(() => expect(screen.getAllByText('Empty')).toHaveLength(8))
  })
})

describe('general tab', () => {
  it('changes theme, startup and clip retention, and opens the clips folder', async () => {
    const api = await openSettings()
    openTab('General')
    fireEvent.click(screen.getByRole('tab', { name: 'Dark' }))
    await waitFor(async () => expect((await settingsOf(api)).theme).toBe('dark'))
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')

    fireEvent.click(screen.getByRole('switch', { name: 'Start with Windows' }))
    fireEvent.click(screen.getByRole('switch', { name: /Start in the tray/ }))
    fireEvent.change(screen.getByRole('combobox', { name: 'Keep clips for' }), { target: { value: '0' } })
    await waitFor(async () =>
      expect(await settingsOf(api)).toMatchObject({ startWithWindows: true, startMinimized: true, clipRetentionDays: 0 }),
    )

    fireEvent.click(screen.getByRole('button', { name: 'Open clips folder' }))
    await waitFor(() => expect(api.clipsFolderOpened).toBe(true))
  })
})

describe('about tab', () => {
  it('shows the version and links to the source', async () => {
    const api = await openSettings()
    openTab('About')
    expect(screen.getByText('Version 0.1.0 · fake · MIT license')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Source on GitHub/ }))
    await waitFor(() => expect(api.openedUrl).toBe('https://github.com/ZHANGV25/ringpad'))
  })
})

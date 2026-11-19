import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { App } from './App'
import { makeApi, renderApp, withPads } from './test/render'

describe('main window', () => {
  it('shows the two keys and what they do until the first clip', async () => {
    await renderApp()
    expect(screen.getByText('Listening to your headphones')).toBeTruthy()
    const howTo = screen.getByRole('list', { name: 'How it works' })
    expect(within(howTo).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'F8 Clip what you just heard',
      'F7 Play it to your team',
    ])
    expect(screen.getByText('Last 30 s')).toBeTruthy()
    expect(screen.getByText('5 s')).toBeTruthy()
    expect(screen.getByText('Fill a pad, then press its key')).toBeTruthy()
    expect(document.querySelectorAll('[data-slot]')).toHaveLength(8)
    expect(screen.getAllByText('Add sound')).toHaveLength(8)
    expect(screen.queryByRole('button', { name: 'Send' })).toBeNull()
  })

  it('clips, previews, sends and stops', async () => {
    const api = await renderApp()
    fireEvent.click(screen.getByRole('button', { name: /^Clip/ }))
    expect(await screen.findByText('5.0 s')).toBeTruthy()
    // A new clip previews to you first.
    const stopPreview = await screen.findByRole('button', { name: 'Stop' })
    expect(screen.getByText('only you').id).toBe(stopPreview.getAttribute('aria-describedby'))

    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    expect(await screen.findByText('on air')).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Current clip' }).className).toContain('on-air')
    expect(screen.getByRole('button', { name: 'Preview' })).toBeTruthy()

    // While it is on air, the button stops it, and shows the stop key.
    expect(within(screen.getByRole('button', { name: 'Stop' })).getByText('F9')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
    const send = await screen.findByRole('button', { name: 'Send' })
    expect(within(send).getByText('F7')).toBeTruthy()
    expect(screen.getByText('your team').id).toBe(send.getAttribute('aria-describedby'))
    expect(within(screen.getByRole('button', { name: 'Save' })).getByText('F6')).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Current clip' }).className).not.toContain('on-air')

    const preview = vi.spyOn(api, 'previewClip')
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }))
    expect(preview).toHaveBeenCalledOnce()
  })

  it('saves the clip to a pad from the save sheet', async () => {
    const api = await renderApp()
    await act(() => api.grabClip())
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    const sheet = screen.getByRole('dialog', { name: 'Save clip to a pad' })
    fireEvent.click(within(sheet).getByRole('button', { name: /^2/ }))
    expect(await screen.findByRole('button', { name: 'Play Pad 2' })).toBeTruthy()
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('closes the save sheet with Escape or a click outside', async () => {
    const api = await renderApp()
    await act(() => api.grabClip())
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('shows the armed save and cancels it', async () => {
    const api = await renderApp()
    await act(() => api.grabClip())
    act(() => api.armSave())
    expect(screen.getByText('Press a pad key to save this clip')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByText('Press a pad key to save this clip')).toBeNull())
  })

  it('asks for a sound file when an empty pad is clicked with no clip', async () => {
    const api = await renderApp()
    const save = vi.spyOn(api, 'saveClipToPad')
    fireEvent.click(screen.getByRole('button', { name: 'Add a sound to pad 2' }))
    expect(await screen.findByRole('button', { name: 'Play Air horn' })).toBeTruthy()
    expect(document.querySelector('[data-slot="1"]')?.className).toContain('filled')
    expect(save).not.toHaveBeenCalled()
  })

  it('leaves the pad empty when the file picker is closed', async () => {
    const api = makeApi()
    api.nextPickedFile = null
    await renderApp(api)
    const pick = vi.spyOn(api, 'pickSoundFile')
    const importPad = vi.spyOn(api, 'importPad')
    fireEvent.click(screen.getByRole('button', { name: 'Add a sound to pad 3' }))
    await waitFor(() => expect(pick).toHaveBeenCalledOnce())
    expect(importPad).not.toHaveBeenCalled()
    expect(document.querySelector('[data-slot="2"]')?.className).not.toContain('filled')
  })

  it('plays a filled pad', async () => {
    const api = await renderApp(await withPads(makeApi(), [0]))
    const play = vi.spyOn(api, 'playPad')
    fireEvent.click(screen.getByRole('button', { name: 'Play Pad 1' }))
    expect(play).toHaveBeenCalledWith({ slot: 0 })
    await waitFor(() => expect(document.querySelector('[data-slot="0"]')?.className).toContain('playing'))
    // A pad playing is not the clip going out.
    expect(screen.getByRole('region', { name: 'Current clip' }).className).not.toContain('on-air')
  })

  it('keeps the clip on an empty pad with one click', async () => {
    const api = await renderApp(await withPads(makeApi(), [0]))
    await act(() => api.grabClip())
    expect(screen.getAllByText('Save clip')).toHaveLength(7)
    fireEvent.click(screen.getByRole('button', { name: 'Save the clip to pad 3' }))
    expect(await screen.findByRole('button', { name: 'Play Pad 3' })).toBeTruthy()
    expect(document.querySelector('[data-slot="2"]')?.className).toContain('filled')
  })

  it('opens the pad sheet and renames, sets volume and hotkey', async () => {
    const api = await renderApp(await withPads(makeApi(), [0]))
    fireEvent.click(screen.getByRole('button', { name: 'Pad 1 options' }))
    const sheet = screen.getByRole('dialog', { name: 'Pad 1' })

    const name = within(sheet).getByRole('textbox')
    fireEvent.change(name, { target: { value: '  Nice shot ' } })
    fireEvent.keyDown(name, { key: 'Enter' })
    expect(await screen.findByRole('button', { name: 'Play Nice shot' })).toBeTruthy()
    fireEvent.change(name, { target: { value: 'Clutch' } })
    fireEvent.blur(name)
    expect(await screen.findByRole('button', { name: 'Play Clutch' })).toBeTruthy()

    fireEvent.change(within(sheet).getByRole('slider', { name: 'Volume' }), { target: { value: '0.25' } })
    expect(await within(sheet).findByText('25%')).toBeTruthy()

    fireEvent.click(within(sheet).getByRole('button', { name: 'Change' }))
    expect(within(sheet).getByText('Press a key')).toBeTruthy()
    act(() => api.simulateKey('k'))
    await waitFor(() => expect(within(sheet).getByText('K')).toBeTruthy())

    fireEvent.click(within(sheet).getByRole('button', { name: 'Done' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('cancels a pad key with Escape and keeps the sheet open', async () => {
    const api = await renderApp(await withPads(makeApi(), [0]))
    fireEvent.click(screen.getByRole('button', { name: 'Pad 1 options' }))
    const sheet = screen.getByRole('dialog', { name: 'Pad 1' })
    const escapeInPage = () => fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })

    // In the real app one Escape reaches both the page and the engine's key capture, in either order.
    fireEvent.click(within(sheet).getByRole('button', { name: 'Change' }))
    escapeInPage()
    act(() => api.simulateKey('escape'))
    expect(screen.getByRole('dialog', { name: 'Pad 1' })).toBe(sheet)
    expect(within(sheet).getByRole('button', { name: 'Change' })).toBeTruthy()

    fireEvent.click(within(sheet).getByRole('button', { name: 'Change' }))
    act(() => api.simulateKey('escape'))
    escapeInPage()
    expect(screen.getByRole('dialog', { name: 'Pad 1' })).toBe(sheet)
    expect((await api.getSnapshot()).pads[0]?.hotkey).toBe('f1')

    // With no key being set, Escape closes the sheet as before.
    escapeInPage()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('does not rename to a blank name', async () => {
    const api = await renderApp(await withPads(makeApi(), [0]))
    const rename = vi.spyOn(api, 'renamePad')
    fireEvent.contextMenu(document.querySelector('[data-slot="0"]') as Element)
    const name = within(screen.getByRole('dialog')).getByRole('textbox')
    fireEvent.change(name, { target: { value: '   ' } })
    fireEvent.blur(name)
    expect(rename).not.toHaveBeenCalled()
  })

  it('clears a pad only after confirming', async () => {
    await renderApp(await withPads(makeApi(), [0]))
    fireEvent.contextMenu(document.querySelector('[data-slot="1"]') as Element)
    expect(screen.queryByRole('dialog')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Pad 1 options' }))
    fireEvent.click(screen.getByRole('button', { name: /Clear pad/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Keep' }))
    fireEvent.click(screen.getByRole('button', { name: /Clear pad/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    // The clip is still there, so the cleared pad offers to keep it.
    expect(await screen.findByRole('button', { name: 'Save the clip to pad 1' })).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('sets the clip volume from the footer', async () => {
    await renderApp()
    expect(screen.getByText('Your team hears')).toBeTruthy()
    expect(screen.getByRole('meter', { name: 'What your team hears' })).toBeTruthy()
    fireEvent.change(screen.getByRole('slider', { name: 'Clip volume' }), { target: { value: '0.8' } })
    expect(await screen.findByText('80%')).toBeTruthy()
  })

  it('shows talk status chips and blocked messages near the meters', async () => {
    const api = await renderApp(makeApi({ settings: { micMode: 'pushToTalk', hotkeys: { talk: 't' } as never } }))
    expect(screen.getByText('Mic off')).toBeTruthy()
    act(() => api.simulateKeyDown('t'))
    expect(await screen.findByText('Mic on')).toBeTruthy()
    act(() => api.simulateKeyUp('t'))
    expect(await screen.findByText('Mic off')).toBeTruthy()

    await act(() => api.updateSettings({ patch: { pressTalkKeys: 'clips' } }))
    await act(() => api.testTalkKeys())
    expect(await screen.findByText('Holding V')).toBeTruthy()

    act(() => api.simulateTalkBlocked('Windows blocked VALORANT. Run Ringpad as administrator.'))
    expect(screen.getByRole('alert').textContent).toBe('Windows blocked VALORANT. Run Ringpad as administrator.')
    api.dispose()
  })

  it('offers a fix when the engine needs setup, and opens settings', async () => {
    const api = await renderApp()
    act(() => api.simulateStatus({ kind: 'needsSetup', reason: 'No virtual cable' }))
    expect(screen.getByText('No virtual cable')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Fix' }))
    expect(screen.getByRole('tablist', { name: 'Settings sections' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(screen.getByText('No virtual cable')).toBeTruthy()

    act(() => api.simulateStatus({ kind: 'waiting', sourceLabel: 'Valorant' }))
    expect(screen.getByText('Waiting for Valorant to open')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Fix' })).toBeNull()

    act(() => api.simulateStatus({ kind: 'starting' }))
    expect(screen.getByText('Starting')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Fix' })).toBeNull()
  })
})

describe('notices', () => {
  it('shows engine errors and hides them after a few seconds', async () => {
    const api = await renderApp()
    vi.useFakeTimers()
    act(() => api.emitError('Lost the virtual cable'))
    expect(screen.getByRole('alert').textContent).toBe('Lost the virtual cable')
    act(() => vi.advanceTimersByTime(4000))
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('reports a failed command instead of dropping it', async () => {
    const api = await renderApp()
    vi.spyOn(api, 'grabClip').mockRejectedValue(new Error('Nothing recorded yet'))
    fireEvent.click(screen.getByRole('button', { name: /^Clip/ }))
    expect((await screen.findByRole('alert')).textContent).toBe('Nothing recorded yet')
  })

  it('reports a snapshot that fails to load', async () => {
    const api = makeApi()
    vi.spyOn(api, 'getSnapshot').mockRejectedValue('engine offline')
    render(<App api={api} />)
    expect((await screen.findByRole('alert')).textContent).toBe('engine offline')
    expect(screen.getByText('Starting')).toBeTruthy()
  })
})

describe('file drop', () => {
  const at = { x: 10, y: 10 }

  function pointAt(slot: number | null) {
    const target = slot === null ? null : document.querySelector(`[data-slot="${slot}"]`)
    document.elementFromPoint = vi.fn(() => target)
  }

  it('highlights the pad under the file and imports it on drop', async () => {
    const api = await renderApp()
    pointAt(2)
    act(() => api.emitFileDrop({ type: 'enter', paths: ['C:\\clips\\gg.mp3'], position: at }))
    expect(screen.getByText('Drop here')).toBeTruthy()
    act(() => api.emitFileDrop({ type: 'leave' }))
    expect(screen.queryByText('Drop here')).toBeNull()

    act(() => api.emitFileDrop({ type: 'over', position: at }))
    act(() => api.emitFileDrop({ type: 'drop', paths: ['C:\\clips\\notes.txt', 'C:\\clips\\gg.mp3'], position: at }))
    expect(await screen.findByRole('button', { name: 'Play gg' })).toBeTruthy()
    expect(screen.queryByText('Drop here')).toBeNull()
  })

  it('explains what to drop when the file or the spot is wrong', async () => {
    const api = await renderApp()
    pointAt(0)
    act(() => api.emitFileDrop({ type: 'drop', paths: ['C:\\notes.txt'], position: at }))
    expect(screen.getByRole('alert').textContent).toBe('Drop a WAV, MP3, OGG or FLAC file on a pad.')

    pointAt(null)
    const importPad = vi.spyOn(api, 'importPad')
    act(() => api.emitFileDrop({ type: 'drop', paths: ['C:\\a.wav'], position: at }))
    expect(importPad).not.toHaveBeenCalled()
  })
})

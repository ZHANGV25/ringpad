import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { App } from './App'
import { makeApi, renderApp, withPads } from './test/render'

describe('main window', () => {
  it('shows the empty state until the first clip', async () => {
    await renderApp()
    expect(screen.getByText('Listening to your headphones')).toBeTruthy()
    expect(screen.getByText('No clip yet')).toBeTruthy()
    expect(screen.getByText('Last 30 s · a clip takes 5 s')).toBeTruthy()
    expect(document.querySelectorAll('[data-slot]')).toHaveLength(8)
    expect(screen.getByRole('button', { name: 'Pad 1, empty' })).toBeTruthy()
  })

  it('clips, previews, sends and stops', async () => {
    const api = await renderApp()
    fireEvent.click(screen.getByRole('button', { name: /^Clip/ }))
    expect(await screen.findByText('Previewing')).toBeTruthy()
    expect(screen.getByText('5.0 s')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    expect(await screen.findByRole('button', { name: 'Stop' })).toBeTruthy()
    expect(screen.getByText('Sending')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
    expect(await screen.findByRole('button', { name: 'Send' })).toBeTruthy()
    expect(screen.getByText('Current clip')).toBeTruthy()

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
    expect(screen.queryByRole('dialog')).toBeNull()
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

  it('plays a filled pad and ignores an empty one', async () => {
    const api = await renderApp(await withPads(makeApi(), [0]))
    const play = vi.spyOn(api, 'playPad')
    fireEvent.click(screen.getByRole('button', { name: 'Pad 2, empty' }))
    expect(play).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Play Pad 1' }))
    expect(play).toHaveBeenCalledWith({ slot: 0 })
    await waitFor(() => expect(document.querySelector('[data-slot="0"]')?.className).toContain('active'))
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
    expect(await screen.findByRole('button', { name: 'Pad 1, empty' })).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('sets the send volume from the footer', async () => {
    await renderApp()
    fireEvent.change(screen.getByRole('slider', { name: 'Others hear' }), { target: { value: '0.8' } })
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
    expect(screen.getByText('Drop to import')).toBeTruthy()
    act(() => api.emitFileDrop({ type: 'leave' }))
    expect(screen.queryByText('Drop to import')).toBeNull()

    act(() => api.emitFileDrop({ type: 'over', position: at }))
    act(() => api.emitFileDrop({ type: 'drop', paths: ['C:\\clips\\notes.txt', 'C:\\clips\\gg.mp3'], position: at }))
    expect(await screen.findByRole('button', { name: 'Play gg' })).toBeTruthy()
    expect(screen.queryByText('Drop to import')).toBeNull()
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

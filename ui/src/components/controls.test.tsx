import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { IconButton, KeyChip, Segmented, Sheet, Slider, Toggle } from './controls'
import { PandaMark } from './panda/PandaMark'

describe('controls', () => {
  it('Segmented moves with arrows and wraps around', () => {
    const onChange = vi.fn()
    render(<Segmented label="Pick" options={['a', 'b', 'c'] as const} value="a" labels={{ a: 'A', b: 'B', c: 'C' }} onChange={onChange} />)
    const list = screen.getByRole('tablist', { name: 'Pick' })
    expect(list.className).toBe('segmented')
    fireEvent.keyDown(list, { key: 'ArrowLeft' })
    fireEvent.keyDown(list, { key: 'ArrowRight' })
    fireEvent.keyDown(list, { key: 'Home' })
    expect(onChange.mock.calls).toEqual([['c'], ['b']])
    expect(screen.getByRole('tab', { name: 'A' }).tabIndex).toBe(0)
    expect(screen.getByRole('tab', { name: 'B' }).tabIndex).toBe(-1)
  })

  it('Slider shows percent or a suffix', () => {
    const onChange = vi.fn()
    const { rerender } = render(<Slider label="Level" value={0.42} min={0} max={1} step={0.01} percent onChange={onChange} />)
    expect(screen.getByText('42%')).toBeTruthy()
    fireEvent.change(screen.getByRole('slider', { name: 'Level' }), { target: { value: '0.5' } })
    expect(onChange).toHaveBeenCalledWith(0.5)
    rerender(<Slider label="Level" value={7} min={7} max={7} step={1} suffix=" s" onChange={onChange} />)
    expect(screen.getByText('7 s')).toBeTruthy()
  })

  it('KeyChip shows a key, none, or a capture prompt', () => {
    const { rerender } = render(<KeyChip name="mouse4" />)
    expect(screen.getByText('Mouse 4 (lower side)').className).toBe('key-chip ')
    rerender(<KeyChip name={null} />)
    expect(screen.getByText('None').className).toContain('faint')
    rerender(<KeyChip name="f1" capturing />)
    expect(screen.getByText('Press a key').className).toContain('capturing')
  })

  it('Toggle reports the new state', () => {
    const onChange = vi.fn()
    render(<Toggle checked={false} label="Loud" onChange={onChange} />)
    fireEvent.click(screen.getByRole('switch', { name: 'Loud' }))
    expect(onChange).toHaveBeenCalledWith(true)
  })

  it('IconButton exposes its label and pressed state', () => {
    const onClick = vi.fn()
    render(
      <IconButton label="Mute" pressed onClick={onClick}>
        <PandaMark />
      </IconButton>,
    )
    const button = screen.getByRole('button', { name: 'Mute' })
    expect(button.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(button)
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('Sheet closes on Escape only', () => {
    const onClose = vi.fn()
    const { unmount } = render(
      <Sheet title="Options" onClose={onClose}>
        <p>Body</p>
      </Sheet>,
    )
    expect(screen.getByRole('dialog', { name: 'Options' })).toBeTruthy()
    fireEvent.keyDown(window, { key: 'Enter' })
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
    unmount()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
  })
})

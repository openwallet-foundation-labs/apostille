import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { WorkflowInstancePanel } from '..'

describe('WorkflowInstancePanel', () => {
  test('renders text and button and fires advance', () => {
    const status = {
      instance_id: 'i1',
      state: 'menu',
      allowed_events: ['go'],
      action_menu: [],
      artifacts: {},
      ui: [ { type: 'text', text: 'Hello' }, { type: 'button', label: 'Go', event: 'go' } ],
    } as any
    const onAdvance = jest.fn()
    render(<WorkflowInstancePanel status={status} onAdvance={onAdvance} />)
    expect(screen.queryByText('Hello')).not.toBeNull()
    fireEvent.click(screen.getByText('Go'))
    expect(onAdvance).toHaveBeenCalledTimes(1)
    const args = (onAdvance as any).mock.calls[0]
    expect(args[0]).toBe('go')
    expect(args[1]).toBeUndefined()
  })

  test('renders submit-button with input_schema and submits form', () => {
    const status = {
      instance_id: 'i1', state: 'collect', allowed_events: ['next'], action_menu: [], artifacts: {},
      ui: [ { type: 'submit-button', label: 'Next', event: 'next', input_schema: { type: 'object', properties: { name: { type: 'string', title: 'Name' } }, required: ['name'] } } ],
    } as any
    const onAdvance = jest.fn()
    render(<WorkflowInstancePanel status={status} onAdvance={onAdvance} />)
    const input = screen.getByLabelText(/Name/) as HTMLInputElement
    fireEvent.change(input, { target: { value: 'Alice' } })
    fireEvent.click(screen.getByText('Next'))
    expect(onAdvance).toHaveBeenCalledWith('next', { name: 'Alice' })
  })

  test('renders assets for image and video', () => {
    const status = {
      instance_id: 'i1', state: 'menu', allowed_events: [], action_menu: [], artifacts: {},
      assets: { logo: { mediaType: 'image/png', uri: 'http://example.com/logo.png' }, clip: { mediaType: 'video/mp4', uri: 'http://example.com/clip.mp4' } },
      ui: [ { type: 'image', asset: 'logo', alt: 'Logo' }, { type: 'video', asset: 'clip' } ],
    } as any
    render(<WorkflowInstancePanel status={status} onAdvance={jest.fn()} />)
    expect(document.querySelector('img')?.getAttribute('src')).toBe('http://example.com/logo.png')
    expect(document.querySelector('video')?.getAttribute('src')).toBe('http://example.com/clip.mp4')
  })
})

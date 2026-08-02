import { describe, expect, it } from 'vitest'

import { getHookEventImplementation, onEvent } from './events.js'

describe('onEvent', () => {
	it('creates an immutable opaque named-event definition', () => {
		const handler = () => undefined
		const definition = onEvent({ handler, name: 'post.created' })

		expect(definition).toStrictEqual({
			kind: 'hook-event',
			name: 'post.created',
		})
		expect(Object.isFrozen(definition)).toBe(true)
		expect(getHookEventImplementation(definition)).toMatchObject({
			handler,
			name: 'post.created',
		})
	})

	it('rejects malformed options without trusting structural lookalikes', () => {
		for (const options of [
			null,
			{},
			{ handler: undefined, name: 'post.created' },
			{ handler: () => undefined, name: '' },
			{ extra: true, handler: () => undefined, name: 'post.created' },
		]) {
			expect(() => onEvent(options as never)).toThrow(TypeError)
		}

		expect(
			getHookEventImplementation({ kind: 'hook-event', name: 'post.created' }),
		).toBeUndefined()
	})
})

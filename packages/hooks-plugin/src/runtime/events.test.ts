import { describe, expect, it } from 'vitest'

import {
	defineEvent,
	getHookEventImplementation,
	isHookEventContract,
	onEvent,
} from './events.js'

describe('defineEvent', () => {
	it('creates one immutable trusted contract bound by value', () => {
		const event = defineEvent('post.created')

		expect(event).toStrictEqual({
			kind: 'hook-event-contract',
			name: 'post.created',
		})
		expect(Object.isFrozen(event)).toBe(true)
		expect(isHookEventContract(event)).toBe(true)
		// Two contracts with one name stay distinct values.
		expect(defineEvent('post.created')).not.toBe(event)
	})

	it('rejects an empty name and structural lookalikes', () => {
		expect(() => defineEvent('')).toThrow(TypeError)
		expect(
			isHookEventContract({
				kind: 'hook-event-contract',
				name: 'post.created',
			}),
		).toBe(false)
	})
})

describe('onEvent', () => {
	it('creates an immutable opaque consumer of one contract', () => {
		const handler = () => undefined
		const event = defineEvent('post.created')
		const definition = onEvent(event, handler)

		expect(definition).toStrictEqual({
			kind: 'hook-event',
			name: 'post.created',
		})
		expect(Object.isFrozen(definition)).toBe(true)
		expect(getHookEventImplementation(definition)).toMatchObject({
			contract: event,
			handler,
		})
	})

	it('rejects forged contracts and non-function handlers', () => {
		const event = defineEvent('post.created')
		expect(() =>
			onEvent(
				{ kind: 'hook-event-contract', name: 'post.created' } as never,
				() => undefined,
			),
		).toThrow('onEvent requires an event created by defineEvent')
		expect(() => onEvent(event, undefined as never)).toThrow(
			'onEvent handler must be a function',
		)
		expect(
			getHookEventImplementation({ kind: 'hook-event', name: 'post.created' }),
		).toBeUndefined()
	})
})

import { describe, expect, it } from 'vitest'

import {
	defineEvent,
	getHookEventContractImplementation,
	getHookEventImplementation,
	onEvent,
} from './events.js'

describe('defineEvent', () => {
	it('creates one immutable trusted delivery contract', () => {
		const event = defineEvent()('post.created', { delivery: 'optional' })

		expect(event).toStrictEqual({
			delivery: 'optional',
			kind: 'hook-event-contract',
			name: 'post.created',
		})
		expect(Object.isFrozen(event)).toBe(true)
		expect(getHookEventContractImplementation(event)).toStrictEqual({
			delivery: 'optional',
			name: 'post.created',
		})
	})

	it('rejects malformed contracts and structural lookalikes', () => {
		const createEvent = defineEvent()

		for (const [name, options] of [
			['', { delivery: 'optional' }],
			['post.created', null],
			['post.created', {}],
			['post.created', { delivery: 'ignored' }],
			['post.created', { delivery: 'required', extra: true }],
		] as const) {
			expect(() => createEvent(name, options as never)).toThrow(TypeError)
		}

		expect(
			getHookEventContractImplementation({
				delivery: 'optional',
				kind: 'hook-event-contract',
				name: 'post.created',
			}),
		).toBeUndefined()
	})
})

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

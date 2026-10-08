import { describe, expect, it, vi } from 'vitest'

import {
	getEnforcementContributionImplementation,
	guard,
} from './definitions.js'
import { UltimaBase } from '../application/ultima-base.js'

const postSchema = UltimaBase.Schema.define({
	className: 'EnforcementPost',
	fields: (field) => ({
		title: field.string(),
	}),
})

describe('policy-neutral enforcement definitions', () => {
	it('retains immutable matching metadata while hiding executable handlers', async () => {
		const handler = vi.fn()
		const definition = guard({
			handler,
			operations: ['create-one', 'update-one', 'create-one'],
			schema: postSchema,
		})
		const implementation = getEnforcementContributionImplementation(definition)

		expect(definition).toStrictEqual({
			kind: 'guard',
			operations: ['create-one', 'update-one'],
			schema: postSchema,
		})
		expect(Object.isFrozen(definition)).toBe(true)
		expect(Object.isFrozen(definition.operations)).toBe(true)
		expect(Object.values(definition)).not.toContain(handler)

		await implementation?.run({} as never)
		expect(handler).toHaveBeenCalledOnce()
	})

	it('keeps explicit master behavior private beside executable handlers', () => {
		const bypassed = guard({
			handler: () => undefined,
			master: 'bypass',
		})
		const enforced = guard({ handler: () => undefined })

		expect(bypassed).not.toHaveProperty('master')
		expect(getEnforcementContributionImplementation(bypassed)?.master).toBe(
			'bypass',
		)
		expect(getEnforcementContributionImplementation(enforced)?.master).toBe(
			'enforce',
		)
		expect(() =>
			guard({ handler: () => undefined, master: 'invalid' as never }),
		).toThrow('enforcement contribution master must be bypass or enforce')
	})

	it('creates guards without attaching plugin provenance', () => {
		const definition = guard({ handler: () => undefined })

		expect(definition.kind).toBe('guard')
		expect(definition).not.toHaveProperty('ownerPlugin')
		expect(Object.isFrozen(definition)).toBe(true)
	})

	it.each([
		[null, 'enforcement contribution options must be a plain object'],
		[{}, 'enforcement contribution handler must be a function'],
		[
			{ handler: (): undefined => undefined, extra: true },
			'enforcement contribution contains unknown key: extra',
		],
		[
			{ handler: (): undefined => undefined, operations: [] },
			'enforcement contribution operations must be a non-empty array',
		],
		[
			{ handler: (): undefined => undefined, operations: ['unknown'] },
			'Unknown enforcement operation kind: unknown',
		],
		[
			{ handler: (): undefined => undefined, schema: {} },
			'enforcement contribution schema must be a schema definition',
		],
	] as const)('rejects malformed JavaScript options %#', (options, message) => {
		expect(() => guard(options as never)).toThrow(message)
	})

	it('does not resolve structurally forged definitions', () => {
		expect(
			getEnforcementContributionImplementation({
				kind: 'guard',
				operations: undefined,
				schema: undefined,
			}),
		).toBeUndefined()
	})
})

import { describe, expect, it, vi } from 'vitest'

import { Schema, stringField } from '../../schema/index.js'
import {
	constraint,
	databaseConstraint,
	getEnforcementContributionImplementation,
	guard,
	isDatabaseConstraintNode,
	restrictInput,
	restrictOutput,
	restrictSelection,
} from './definitions.js'

const postSchema = Schema.define({
	className: 'EnforcementPost',
	fields: {
		title: stringField(),
	},
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
		const bypassed = constraint({
			handler: () => databaseConstraint('fixture.master', 1, {}),
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

	it('creates every generic category without attaching plugin provenance', () => {
		const definitions = [
			constraint({
				handler: () => databaseConstraint('tenant.row', 1, { tenantId: 'one' }),
			}),
			guard({ handler: () => undefined }),
			restrictInput({ handler: () => ['title'] }),
			restrictSelection({ handler: () => ['title'] }),
			restrictOutput({ handler: () => ['title'] }),
		]

		expect(definitions.map(({ kind }) => kind)).toStrictEqual([
			'constraint',
			'guard',
			'restrictInput',
			'restrictSelection',
			'restrictOutput',
		])

		for (const definition of definitions) {
			expect(definition).not.toHaveProperty('ownerPlugin')
			expect(Object.isFrozen(definition)).toBe(true)
		}
	})

	it('creates detached immutable namespaced database constraint nodes', () => {
		const payload = {
			nested: { visible: true },
			tags: ['first'],
			tenantId: 'tenant-1',
		}
		const node = databaseConstraint('fixture.tenant-row', 1, payload)
		payload.nested.visible = false
		payload.tags.push('changed')

		expect(node).toStrictEqual({
			kind: 'fixture.tenant-row',
			version: 1,
			payload: {
				nested: { visible: true },
				tags: ['first'],
				tenantId: 'tenant-1',
			},
		})
		expect(Object.isFrozen(node)).toBe(true)
		expect(Object.isFrozen(node.payload)).toBe(true)
		expect(Object.isFrozen(node.payload.nested)).toBe(true)
		expect(Object.isFrozen(node.payload.tags)).toBe(true)
		expect(isDatabaseConstraintNode(node)).toBe(true)
		expect(isDatabaseConstraintNode({ ...node })).toBe(false)
		expect(() => databaseConstraint('tenant', 1, payload)).toThrow(
			'database constraint kind must use lowercase dot-separated namespace segments',
		)
		expect(() => databaseConstraint('tenant..row', 1, payload)).toThrow(
			'database constraint kind must use lowercase dot-separated namespace segments',
		)
		expect(() => databaseConstraint('Tenant.row value', 1, payload)).toThrow(
			'database constraint kind must use lowercase dot-separated namespace segments',
		)
		expect(() =>
			databaseConstraint('fixture.invalid-number', 1, { value: Number.NaN }),
		).toThrow(
			'database constraint payload.value must contain only finite numbers',
		)
		expect(() =>
			databaseConstraint('fixture.class-instance', 1, {
				value: new Date('2026-08-02T00:00:00.000Z'),
			} as never),
		).toThrow(
			'database constraint payload.value must contain only portable scalar, array, and plain-object values',
		)
		expect(() => databaseConstraint('fixture.version', 0, payload)).toThrow(
			'database constraint version must be a positive safe integer',
		)
		expect(() => databaseConstraint('fixture.version', 1.5, payload)).toThrow(
			'database constraint version must be a positive safe integer',
		)
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

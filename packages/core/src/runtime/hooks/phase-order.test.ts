import { describe, expect, it } from 'vitest'

import type { OperationKind } from '../../query/index.js'
import { getMutationHookKind, getNativeHookPhaseOrder } from './phase-order.js'

const operationKinds = [
	'count',
	'create-many',
	'create-one',
	'delete-many',
	'delete-one',
	'exists',
	'find-many',
	'find-one',
	'get',
	'update-many',
	'update-one',
	'upsert-many',
	'upsert-one',
] as const satisfies readonly OperationKind[]

describe('native hook phase order', () => {
	it.each(operationKinds)(
		'returns an immutable reusable plan for %s',
		(kind) => {
			const first = getNativeHookPhaseOrder(kind)
			const second = getNativeHookPhaseOrder(kind)

			expect(first).toBe(second)
			expect(Object.isFrozen(first)).toBe(true)
			expect(Object.isFrozen(first.schemaBefore)).toBe(true)
			expect(Object.isFrozen(first.schemaAfter)).toBe(true)
		},
	)

	it('dispatches one exact schema phase around each save family', () => {
		expect(getNativeHookPhaseOrder('create-one')).toMatchObject({
			family: 'create',
			schemaBefore: ['beforeCreate'],
			schemaAfter: ['afterCreate'],
		})
		expect(getNativeHookPhaseOrder('update-one')).toMatchObject({
			family: 'update',
			schemaBefore: ['beforeUpdate'],
			schemaAfter: ['afterUpdate'],
		})
		expect(getNativeHookPhaseOrder('upsert-many')).toMatchObject({
			family: 'upsert',
			schemaBefore: [],
			schemaAfter: ['afterUpsert'],
		})
	})

	it('keeps reads outside schema operation hooks', () => {
		expect(getNativeHookPhaseOrder('find-many')).toStrictEqual({
			family: 'read',
			schemaAfter: [],
			schemaBefore: [],
		})
	})

	it('keeps set-based writes on their parent schema phases', () => {
		expect(getNativeHookPhaseOrder('update-many').schemaBefore).toStrictEqual([
			'beforeUpdate',
		])
		expect(getNativeHookPhaseOrder('delete-many').schemaAfter).toStrictEqual([
			'afterDelete',
		])
	})

	it('maps normalized mutation terminals to cardinality-free hook kinds', () => {
		expect(getMutationHookKind('create-many')).toBe('create')
		expect(getMutationHookKind('update-one')).toBe('update')
		expect(getMutationHookKind('upsert-many')).toBe('upsert')
		expect(getMutationHookKind('delete-one')).toBe('delete')
		expect(() => getMutationHookKind('find-many')).toThrow(
			'Read terminals do not have a mutation hook kind',
		)
	})
})

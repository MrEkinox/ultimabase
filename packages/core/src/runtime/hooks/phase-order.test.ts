import { describe, expect, it } from 'vitest'

import type { OperationKind } from '../../query/index.js'
import { getNativeHookPhaseOrder } from './phase-order.js'

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
			expect(Object.isFrozen(first.fieldBefore)).toBe(true)
			expect(Object.isFrozen(first.fieldAfter)).toBe(true)
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
			schemaBefore: ['beforeUpsert'],
			schemaAfter: ['afterUpsert'],
		})
	})

	it('dispatches only the exact read phases', () => {
		expect(getNativeHookPhaseOrder('find-many')).toStrictEqual({
			family: 'read',
			fieldAfter: [],
			fieldBefore: [],
			schemaAfter: ['afterRead'],
			schemaBefore: ['beforeRead'],
		})
	})

	it('omits materialized field phases for set-based update and delete', () => {
		for (const kind of ['update-many', 'delete-many'] as const) {
			const order = getNativeHookPhaseOrder(kind)

			expect(order.fieldBefore).toStrictEqual([])
			expect(order.fieldAfter).toStrictEqual([])
		}

		expect(getNativeHookPhaseOrder('update-one').fieldBefore).toStrictEqual([
			'beforeSave',
			'beforeUpdate',
		])
		expect(getNativeHookPhaseOrder('delete-one').fieldAfter).toStrictEqual([
			'afterDelete',
		])
	})
})

import { describe, expect, it } from 'vitest'

import { resolveWhereInput } from '../../query/index.js'

import {
	appendEnforcementRowFilter,
	createEnforcementState,
	getEnforcementStateSnapshot,
	narrowEnforcementFields,
} from './state.js'
import { UltimaBase } from '../application/ultima-base.js'

const rowSchema = UltimaBase.Schema.define({
	className: 'EnforcementRows',
	fields: (field) => ({ published: field.boolean() }),
})

describe('monotonic enforcement state', () => {
	it('starts without neutral policy placeholders', () => {
		const state = createEnforcementState()
		const snapshot = getEnforcementStateSnapshot(state)

		expect(snapshot).toStrictEqual({
			inputFields: undefined,
			relationPredicates: [],
			rowFilter: undefined,
			selectionFields: undefined,
		})
		expect(Object.isFrozen(state)).toBe(true)
		expect(Object.isFrozen(snapshot)).toBe(true)
	})

	it('combines private row restrictions with AND without changing prior states', () => {
		const published = resolveWhereInput(rowSchema, {
			published: { eq: true },
		})
		const hidden = resolveWhereInput(rowSchema, {
			published: { eq: false },
		})

		const empty = createEnforcementState()
		const first = appendEnforcementRowFilter(empty, published)
		const combined = appendEnforcementRowFilter(first, hidden)

		expect(getEnforcementStateSnapshot(empty).rowFilter).toBeUndefined()
		expect(getEnforcementStateSnapshot(first).rowFilter).toBe(published)
		expect(getEnforcementStateSnapshot(combined).rowFilter).toMatchObject({
			expressions: [published, hidden],
			kind: 'and',
		})
	})

	it('intersects each field boundary independently and never restores fields', () => {
		const empty = createEnforcementState()
		const first = narrowEnforcementFields(empty, 'selection', [
			'id',
			'title',
			'secret',
			'title',
		])
		const second = narrowEnforcementFields(first, 'selection', ['title', 'id'])
		const attemptedBroadening = narrowEnforcementFields(second, 'selection', [
			'id',
			'title',
			'secret',
		])
		const withInput = narrowEnforcementFields(attemptedBroadening, 'input', [
			'title',
		])
		const snapshot = getEnforcementStateSnapshot(withInput)

		expect(snapshot.selectionFields).toStrictEqual(['id', 'title'])
		expect(snapshot.inputFields).toStrictEqual(['title'])
		expect(Object.isFrozen(snapshot.selectionFields)).toBe(true)
	})

	it('rejects invalid effects and foreign state lookalikes deterministically', () => {
		const state = createEnforcementState()

		expect(() => narrowEnforcementFields(state, 'input', [''])).toThrow(
			'enforcement field restriction[0] must be a non-empty string',
		)
		expect(() => getEnforcementStateSnapshot({} as never)).toThrow(
			'Unknown enforcement state',
		)
	})
})

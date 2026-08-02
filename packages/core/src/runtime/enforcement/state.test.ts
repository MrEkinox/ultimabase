import { describe, expect, it } from 'vitest'

import { databaseConstraint } from './definitions.js'
import {
	appendEnforcementConstraints,
	createEnforcementState,
	getEnforcementStateSnapshot,
	narrowEnforcementFields,
} from './state.js'

describe('monotonic enforcement state', () => {
	it('starts without neutral policy placeholders', () => {
		const state = createEnforcementState()
		const snapshot = getEnforcementStateSnapshot(state)

		expect(snapshot).toStrictEqual({
			constraints: [],
			inputFields: undefined,
			outputFields: undefined,
			selectionFields: undefined,
		})
		expect(Object.isFrozen(state)).toBe(true)
		expect(Object.isFrozen(snapshot)).toBe(true)
		expect(Object.isFrozen(snapshot.constraints)).toBe(true)
	})

	it('appends independent opaque constraints without changing prior states', () => {
		const tenant = databaseConstraint('fixture.tenant', { tenantId: 'one' })
		const visible = databaseConstraint('fixture.visibility', { public: true })
		const empty = createEnforcementState()
		const withTenant = appendEnforcementConstraints(empty, tenant)
		const complete = appendEnforcementConstraints(withTenant, [visible])

		expect(getEnforcementStateSnapshot(empty).constraints).toStrictEqual([])
		expect(getEnforcementStateSnapshot(withTenant).constraints).toStrictEqual([
			tenant,
		])
		expect(getEnforcementStateSnapshot(complete).constraints).toStrictEqual([
			tenant,
			visible,
		])
		expect(
			Object.isFrozen(getEnforcementStateSnapshot(complete).constraints),
		).toBe(true)
	})

	it('deduplicates structurally identical constraints across reevaluation', () => {
		const first = databaseConstraint('fixture.tenant', { tenantId: 'one' })
		const repeated = databaseConstraint('fixture.tenant', { tenantId: 'one' })
		const changed = databaseConstraint('fixture.tenant', { tenantId: 'two' })
		const state = appendEnforcementConstraints(createEnforcementState(), [
			first,
			repeated,
			changed,
		])

		expect(getEnforcementStateSnapshot(state).constraints).toStrictEqual([
			first,
			changed,
		])
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
		const complete = narrowEnforcementFields(withInput, 'output', [])
		const snapshot = getEnforcementStateSnapshot(complete)

		expect(snapshot.selectionFields).toStrictEqual(['id', 'title'])
		expect(snapshot.inputFields).toStrictEqual(['title'])
		expect(snapshot.outputFields).toStrictEqual([])
		expect(Object.isFrozen(snapshot.selectionFields)).toBe(true)
	})

	it('rejects invalid effects and foreign state lookalikes deterministically', () => {
		const state = createEnforcementState()

		// A policy may append nothing, for example when it implements its own master bypass.
		expect(
			getEnforcementStateSnapshot(appendEnforcementConstraints(state, []))
				.constraints,
		).toStrictEqual([])
		expect(() =>
			appendEnforcementConstraints(state, {
				kind: 'fixture.forged',
				payload: null,
			}),
		).toThrow('enforcement constraint[0] must be a database constraint node')
		expect(() => narrowEnforcementFields(state, 'input', [''])).toThrow(
			'enforcement field restriction[0] must be a non-empty string',
		)
		expect(() => getEnforcementStateSnapshot({} as never)).toThrow(
			'Unknown enforcement state',
		)
	})
})

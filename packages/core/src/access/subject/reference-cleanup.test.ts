import { describe, expect, it, vi } from 'vitest'

import type { RequestSubjectContext } from '../request/context.js'
import { RequestSubjectReference } from './contracts.js'
import {
	defineRequestSubjectReferenceCleanup,
	isRequestSubjectReferenceCleanup,
} from './reference-cleanup.js'

describe('access reference cleanup contributions', () => {
	const context: RequestSubjectContext = {
		access: { mode: 'anonymous' },
		getValue: () => undefined,
		hasCapability: () => false,
		requestId: 'reference-cleanup-test',
		signal: new AbortController().signal,
		source: 'test',
	}

	it('creates one immutable nominal contribution without executing callbacks', () => {
		const hasReferences = vi.fn(() => true)
		const cleanup = vi.fn(() => undefined)
		const contribution = defineRequestSubjectReferenceCleanup({
			kind: 'role',
			hasReferences,
			cleanup,
		})

		expect(isRequestSubjectReferenceCleanup(contribution)).toBe(true)
		expect(Object.isFrozen(contribution)).toBe(true)
		expect(hasReferences).not.toHaveBeenCalled()
		expect(cleanup).not.toHaveBeenCalled()
		expect(isRequestSubjectReferenceCleanup({ kind: 'role' })).toBe(false)
	})

	it('rejects malformed definitions at the public boundary', () => {
		expect(() =>
			defineRequestSubjectReferenceCleanup({
				kind: '',
				hasReferences: () => false,
				cleanup: () => undefined,
			}),
		).toThrow(
			new TypeError('reference cleanup kind must be a non-empty string'),
		)

		expect(() =>
			defineRequestSubjectReferenceCleanup({
				kind: 'role',
				hasReferences: undefined as unknown as () => boolean,
				cleanup: () => undefined,
			}),
		).toThrow(
			new TypeError('reference cleanup hasReferences must be a function'),
		)
	})

	it('retains the exact reference kind for consumer callbacks', () => {
		const reference = new RequestSubjectReference('role', 'editor')
		const cleanup = defineRequestSubjectReferenceCleanup({
			kind: 'role',
			hasReferences: ({ reference: subject }) => subject === reference,
			cleanup: () => undefined,
		})

		expect(cleanup.hasReferences({ context, reference })).toBe(true)
	})
})

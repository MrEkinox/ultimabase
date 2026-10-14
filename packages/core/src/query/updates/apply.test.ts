import { describe, expect, it } from 'vitest'

import { applyUpdateExpressionToRecord } from './apply.js'
import { normalizeUpdateExpression } from './normalize.js'
import { UltimaBase } from '../../runtime/application/ultima-base.js'

const Account = UltimaBase.Schema.define({
	className: 'AppliedUpdateAccount',
	fields: (field) => ({
		balance: field.decimal(),
		labels: field.string({ list: true }),
		legacy: field.string(),
		sequence: field.bigint(),
		visits: field.int(),
	}),
})

const Profiled = UltimaBase.Schema.define({
	className: 'AppliedUpdateProfile',
	fields: (field) => ({
		history: field.object({
			fields: (child) => ({
				city: child.string({ required: true }),
				line1: child.string({ required: true }),
				zip: child.string(),
			}),
			list: true,
		}),
		metadata: field.json(),
		profile: field.object({
			fields: (child) => ({
				address: child.object({
					fields: (grandchild) => ({
						city: grandchild.string({ required: true }),
						line1: grandchild.string({ required: true }),
						zip: grandchild.string(),
					}),
				}),
				nickname: child.string(),
				settings: child.object({
					fields: (grandchild) => ({ theme: grandchild.string() }),
				}),
				tags: child.string({ list: true }),
			}),
		}),
	}),
})

describe('applyUpdateExpressionToRecord', () => {
	it('applies every portable scalar operation to a detached snapshot', () => {
		const current = Object.freeze({
			balance: '10.00',
			labels: Object.freeze(['old']),
			legacy: 'remove',
			sequence: 10n,
			visits: 4,
		})
		const update = normalizeUpdateExpression(Account, {
			sequence: { decrement: 2n },
			balance: { increment: '1.5' },
			visits: { increment: 3 },
			labels: ['new', 'stable'],
			legacy: null,
		})
		const candidate = applyUpdateExpressionToRecord(Account, current, update)

		expect(candidate).toStrictEqual({
			balance: '11.50',
			labels: ['new', 'stable'],
			legacy: null,
			sequence: 8n,
			visits: 7,
		})
		expect(current).toStrictEqual({
			balance: '10.00',
			labels: ['old'],
			legacy: 'remove',
			sequence: 10n,
			visits: 4,
		})
		expect(Object.isFrozen(candidate)).toBe(true)
	})

	it('preserves absent and null numeric values instead of inventing defaults', () => {
		const update = normalizeUpdateExpression(Account, {
			balance: { increment: '1.25' },
			visits: { increment: 1 },
		})

		expect(
			applyUpdateExpressionToRecord(
				Account,
				{ balance: null, labels: [], sequence: 1n },
				update,
			),
		).toStrictEqual({ balance: null, labels: [], sequence: 1n })
	})

	it('deep-patches a single object field at every depth (ADR-0032)', () => {
		const current = Object.freeze({
			profile: Object.freeze({
				address: Object.freeze({ city: 'Paris', line1: '1 Rue', zip: '75001' }),
				nickname: 'Ada',
				settings: Object.freeze({ theme: 'dark' }),
				tags: Object.freeze(['a', 'b']),
			}),
		})
		const update = normalizeUpdateExpression(Profiled, {
			profile: { address: { city: 'Lyon' }, settings: null, tags: ['c'] },
		})

		const candidate = applyUpdateExpressionToRecord(Profiled, current, update)

		expect(candidate).toStrictEqual({
			profile: {
				address: { city: 'Lyon', line1: '1 Rue', zip: '75001' },
				nickname: 'Ada',
				settings: null,
				tags: ['c'],
			},
		})
		expect(Object.isFrozen(candidate.profile)).toBe(true)
		expect(Object.isFrozen(candidate.profile.address)).toBe(true)
		expect(current.profile.address.city).toBe('Paris')
	})

	it('replaces object lists, JSON values, and null objects', () => {
		const update = normalizeUpdateExpression(Profiled, {
			history: [{ city: 'Nice', line1: '2 Rue' }],
			metadata: { kept: false },
			profile: { nickname: 'Grace' },
		})

		expect(
			applyUpdateExpressionToRecord(
				Profiled,
				{
					history: [{ city: 'Lille', line1: '3 Rue', zip: '59000' }],
					metadata: { dropped: true, kept: true },
					profile: null,
				},
				update,
			),
		).toStrictEqual({
			history: [{ city: 'Nice', line1: '2 Rue' }],
			metadata: { kept: false },
			profile: { nickname: 'Grace' },
		})
		expect(
			applyUpdateExpressionToRecord(
				Profiled,
				{ profile: { nickname: 'Ada' } },
				normalizeUpdateExpression(Profiled, { profile: null }),
			),
		).toStrictEqual({ profile: null })
	})

	it('rejects malformed and unsupported normalized operations', () => {
		expect(() =>
			applyUpdateExpressionToRecord(Account, {}, { kind: 'unknown' }),
		).toThrow('Update application requires an update expression')
		expect(() =>
			applyUpdateExpressionToRecord(Account, {}, {
				kind: 'update-expression',
				operations: [{ field: 'missing', kind: 'set', value: 'nope' }],
			} as never),
		).toThrow('Update application references an unknown field')
	})
})

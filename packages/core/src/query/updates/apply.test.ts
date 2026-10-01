import { describe, expect, it } from 'vitest'

import { applyUpdateExpressionToRecord } from './apply.js'
import { normalizeUpdateExpression } from './normalize.js'
import { decrement, increment } from './operators.js'
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
			sequence: decrement(2n),
			balance: increment('1.5'),
			visits: increment(3),
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
			balance: increment('1.25'),
			visits: increment(1),
		})

		expect(
			applyUpdateExpressionToRecord(
				Account,
				{ balance: null, labels: [], sequence: 1n },
				update,
			),
		).toStrictEqual({ balance: null, labels: [], sequence: 1n })
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

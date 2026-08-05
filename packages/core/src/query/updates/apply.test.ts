import {
	Schema,
	bigintField,
	decimalField,
	intField,
	stringField,
} from '../../schema/index.js'
import { describe, expect, it } from 'vitest'

import { applyUpdateExpressionToRecord } from './apply.js'
import { normalizeUpdateExpression } from './normalize.js'

const Account = Schema.define({
	className: 'AppliedUpdateAccount',
	fields: {
		balance: decimalField(),
		labels: stringField({ list: true }),
		legacy: stringField(),
		sequence: bigintField(),
		visits: intField(),
	},
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
			decrement: { sequence: 2n },
			increment: { balance: '1.5', visits: 3 },
			set: { labels: ['new', 'stable'], legacy: null },
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
			increment: { balance: '1.25', visits: 1 },
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

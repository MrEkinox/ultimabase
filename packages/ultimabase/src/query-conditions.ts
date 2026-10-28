// The conditions of a list field (D-120, D-127, D-149).
import type { Condition } from './adapter.ts'
import { InvalidQuery } from './errors.ts'
import type { ModelInfo } from './schema.ts'
import type { Scalar } from './query-values.ts'
import { entries, integerRange, misfit, unknownKey } from './query-values.ts'

/** What an element of `field` must be, for a message. */
function kindOf(field: Scalar): string {
	if (field.type === 'enum') return `one of ${(field.values ?? []).join(', ')}`
	if (field.type !== 'number') return 'a non-empty clean string'
	return field.integer === true
		? `a whole number ${integerRange}`
		: 'a finite number'
}

/**
 * A list's `has`, `hasSome` and `hasEvery`, which name its elements, and
 * `isEmpty` (D-120, D-127, D-149).
 */
export function listCondition(
	model: ModelInfo,
	field: Scalar,
	value: unknown,
	path: string,
): Condition | undefined {
	const element = (item: unknown, at: string): unknown => {
		if (item === '' || misfit(item, field) !== undefined) {
			throw new InvalidQuery(at, `${at} must be ${kindOf(field)}.`)
		}
		return item
	}
	const condition: { [operator: string]: unknown } = {}
	for (const [operator, operand] of entries(value, path)) {
		const at = `${path}.${operator}`
		if (operator === 'has') condition[operator] = element(operand, at)
		else if (operator === 'isEmpty') {
			if (typeof operand !== 'boolean') {
				throw new InvalidQuery(at, `${at} must be a boolean.`)
			}
			condition[operator] = operand
		} else if (operator !== 'hasSome' && operator !== 'hasEvery') {
			throw unknownKey(at, model.name)
		} else if (!Array.isArray(operand)) {
			throw new InvalidQuery(at, `${at} must be a list.`)
		} else {
			condition[operator] = operand.map((each: unknown, index) =>
				element(each, `${at}.${index}`),
			)
		}
	}
	return Object.keys(condition).length === 0 ? undefined : condition
}

import type { GenericField } from '../../schema/fields/base/contract.js'
import { equalityFieldKinds } from '../../schema/fields/base/filter-kinds.js'
import { hasListOption } from '../../schema/fields/base/options.js'

const shorthandFieldKinds: ReadonlySet<string> = new Set(
	equalityFieldKinds.filter((kind) => kind !== 'json'),
)

/**
 * Reports whether a field accepts the equality shorthand of ADR-0307: non-list
 * scalar, enum and pointer fields. List, `json`, `object`, relation and plugin
 * fields keep explicit operators, since their values can look like operator
 * objects.
 */
export const isWhereShorthandField = (field: GenericField): boolean =>
	shorthandFieldKinds.has(field.kind) && !hasListOption(field.options)

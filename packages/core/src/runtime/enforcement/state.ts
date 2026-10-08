import {
	assertNonEmptyString,
	immutableArray,
	immutableRecord,
	isUnknownArray,
} from '@ultimabase/shared'
import { isDeepStrictEqual } from 'node:util'

import type { EnforcementFieldBoundary } from './contracts.js'
import type { DatabaseConstraintNode } from '../database/contracts.js'
import type {
	DatabaseRelationPredicateScope,
	DatabaseRowFilterNode,
} from '../database/contracts.js'
import { normalizeLogicalFilter } from '../../query/filters/logical.js'
import type { QueryExpressionNode } from '../../query/index.js'
import { isDatabaseConstraintNode } from './definitions.js'

declare const enforcementStateBrand: unique symbol

/** Opaque state prevents contributions from replacing or clearing earlier effects. */
export interface EnforcementState {
	readonly [enforcementStateBrand]: true
}

/** Supplies only Runtime assembly with the accumulated adapter and field effects. */
export interface EnforcementStateSnapshot {
	readonly constraints: readonly DatabaseConstraintNode[]
	readonly inputFields: readonly string[] | undefined
	readonly outputFields: readonly string[] | undefined
	readonly selectionFields: readonly string[] | undefined
	readonly rowFilter: DatabaseRowFilterNode | undefined
	readonly relationPredicates: readonly DatabaseRelationPredicateScope[]
}

const snapshots = new WeakMap<object, EnforcementStateSnapshot>()

const createState = (snapshot: EnforcementStateSnapshot): EnforcementState => {
	const state = immutableRecord({}) as EnforcementState
	snapshots.set(state, snapshot)

	return state
}

/** Reads one immutable snapshot only after every contributing callback has finished. */
export const getEnforcementStateSnapshot = (
	state: EnforcementState,
): EnforcementStateSnapshot => {
	const snapshot = snapshots.get(state)

	if (snapshot === undefined) {
		throw new TypeError('Unknown enforcement state')
	}

	return snapshot
}

/** Starts one request with no synthetic policy effect or placeholder handler. */
export const createEnforcementState = (): EnforcementState =>
	createState(
		immutableRecord({
			constraints: immutableArray([]),
			inputFields: undefined,
			outputFields: undefined,
			selectionFields: undefined,
			rowFilter: undefined,
			relationPredicates: immutableArray([]),
		}),
	)

/** Combines independent private restrictions without making either transformable. */
export const combineDatabaseRowFilters = (
	first: DatabaseRowFilterNode | undefined,
	second: DatabaseRowFilterNode | undefined,
): DatabaseRowFilterNode | undefined => {
	if (first === undefined) return second
	if (second === undefined) return first

	return normalizeLogicalFilter<QueryExpressionNode>({
		kind: 'and',
		expressions: [first, second],
	})
}

/** ANDs one private row restriction without granting any later widening operation. */
export const appendEnforcementRowFilter = (
	state: EnforcementState,
	rowFilter: DatabaseRowFilterNode,
): EnforcementState => {
	const current = getEnforcementStateSnapshot(state)

	return createState(
		immutableRecord({
			...current,
			rowFilter: combineDatabaseRowFilters(
				current.rowFilter,
				normalizeLogicalFilter(rowFilter),
			),
		}),
	)
}

/** Appends target policy once for each exact immutable relation leaf. */
export const appendEnforcementRelationPredicates = (
	state: EnforcementState,
	scopes: readonly DatabaseRelationPredicateScope[],
): EnforcementState => {
	const current = getEnforcementStateSnapshot(state)
	const additions = scopes.filter(
		(scope) =>
			!current.relationPredicates.some(
				(existing) => existing.predicate === scope.predicate,
			),
	)

	return additions.length === 0
		? state
		: createState(
				immutableRecord({
					...current,
					relationPredicates: immutableArray([
						...current.relationPredicates,
						...additions,
					]),
				}),
			)
}

const normalizeConstraints = (
	constraints: DatabaseConstraintNode | readonly DatabaseConstraintNode[],
): readonly DatabaseConstraintNode[] => {
	const values: unknown = constraints
	const normalized = isUnknownArray(values) ? values : [values]

	for (const [index, constraint] of normalized.entries()) {
		if (!isDatabaseConstraintNode(constraint)) {
			throw new TypeError(
				`enforcement constraint[${String(index)}] must be a database constraint node`,
			)
		}
	}

	return immutableArray(normalized as readonly DatabaseConstraintNode[])
}

/** Appends constraints in registration order and offers no removal operation. */
export const appendEnforcementConstraints = (
	state: EnforcementState,
	constraints: DatabaseConstraintNode | readonly DatabaseConstraintNode[],
): EnforcementState => {
	const current = getEnforcementStateSnapshot(state)
	const additions = normalizeConstraints(constraints)
	const uniqueAdditions = additions.filter(
		(addition, index) =>
			![...current.constraints, ...additions.slice(0, index)].some(
				(existing) =>
					existing.kind === addition.kind &&
					existing.version === addition.version &&
					isDeepStrictEqual(existing.payload, addition.payload),
			),
	)

	return createState(
		immutableRecord({
			...current,
			// Structurally identical nodes express the same logical AND condition once.
			constraints: immutableArray([...current.constraints, ...uniqueAdditions]),
		}),
	)
}

const normalizeFields = (fields: readonly string[]): readonly string[] => {
	const untrustedFields: unknown = fields

	if (!isUnknownArray(untrustedFields)) {
		throw new TypeError('enforcement field restriction must be an array')
	}

	const normalized: string[] = []

	for (const [index, field] of untrustedFields.entries()) {
		assertNonEmptyString(
			field,
			`enforcement field restriction[${String(index)}]`,
		)

		if (!normalized.includes(field)) {
			normalized.push(field)
		}
	}

	return immutableArray(normalized)
}

const intersectFields = (
	current: readonly string[] | undefined,
	permitted: readonly string[],
): readonly string[] =>
	current === undefined
		? permitted
		: immutableArray(current.filter((field) => permitted.includes(field)))

/** Intersects one boundary's field set and cannot restore a previously removed field. */
export const narrowEnforcementFields = (
	state: EnforcementState,
	boundary: EnforcementFieldBoundary,
	fields: readonly string[],
): EnforcementState => {
	const current = getEnforcementStateSnapshot(state)
	const permitted = normalizeFields(fields)
	const key = `${boundary}Fields` as const

	return createState(
		immutableRecord({
			...current,
			[key]: intersectFields(current[key], permitted),
		}),
	)
}

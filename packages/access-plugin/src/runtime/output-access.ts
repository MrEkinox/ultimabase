import {
	FrameworkError,
	collectRecordFieldValues,
	readOperationResultSelection,
	readRuntimeFieldValuePath,
	readRuntimeIncludedPointerValue,
	type RuntimeLogicalOperationAst,
} from '@ultimabase/core'
import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import {
	allowUndeclaredFieldAccess,
	type SchemaAccessPlan,
} from '../authoring/plan.js'
import {
	assertAccessRules,
	createAccessDeniedError,
	type AccessScope,
} from './rule-evaluation.js'

/** Lists permitted top-level row fields, or undefined when nothing is narrowed. */
export const computeAccessStaticSelection = (
	schemaPlan: SchemaAccessPlan,
): readonly string[] | undefined => {
	// Relations remain Access-controlled handles but never become row projections.
	const topLevel = schemaPlan.fields.filter(
		({ field, path }) => path.length === 1 && field.kind !== 'relation',
	)
	const permitted = immutableArray(
		topLevel
			.filter(({ read }) =>
				read.item.length === 0
					? allowUndeclaredFieldAccess
					: !read.item.some(({ rule }) => rule === false),
			)
			.map(({ path }) => path[0])
			.filter((field): field is string => field !== undefined),
	)

	// Leaving select-all implicit preserves optional fields when no rule narrows it.
	return permitted.length === topLevel.length ? undefined : permitted
}

/** Rejects an explicit selection of a statically hidden field. */
export const assertAccessExplicitSelection = (
	scope: AccessScope,
	operation: RuntimeLogicalOperationAst,
	permitted: readonly string[] | undefined,
): void => {
	if (permitted === undefined) return
	for (const { field } of readOperationResultSelection(operation).fields) {
		if (!permitted.includes(field)) {
			throw createAccessDeniedError(
				'access-field-read',
				scope.operation,
				scope.plan.getField(scope.schema, [field]),
			)
		}
	}
}

const fieldPathsEqual = (
	left: readonly (number | string)[],
	right: readonly (number | string)[],
): boolean =>
	left.length === right.length &&
	left.every((segment, index) => segment === right[index])

/** Omits one concrete property without changing surrounding list cardinality. */
const removeConcreteFieldPath = (
	value: unknown,
	path: readonly (number | string)[],
): unknown => {
	const [segment, ...tail] = path
	if (segment === undefined) {
		throw new TypeError('Native Access cannot omit an empty field path')
	}

	if (typeof segment === 'number') {
		if (
			!isUnknownArray(value) ||
			segment >= value.length ||
			tail.length === 0
		) {
			throw new TypeError(
				'Native Access cannot omit an invalid list field path',
			)
		}
		const items = [...value]
		items[segment] = removeConcreteFieldPath(items[segment], tail)
		return immutableArray(items)
	}

	if (!isPlainRecord(value) || !Object.hasOwn(value, segment)) {
		throw new TypeError('Native Access cannot omit an unavailable field path')
	}
	if (tail.length === 0) {
		return immutableRecord(
			Object.fromEntries(
				Object.entries(value).filter(([key]) => key !== segment),
			),
		)
	}
	return immutableRecord({
		...value,
		[segment]: removeConcreteFieldPath(value[segment], tail),
	})
}

/** Removes every value whose field output rule denies it, parent first. */
const enforceRecordOutput = async (
	scope: AccessScope,
	record: Readonly<Record<string, unknown>>,
): Promise<Readonly<Record<string, unknown>>> => {
	let projected = record
	const values = collectRecordFieldValues(
		scope.schema.fields,
		record,
		'parent-first',
	)

	for (const value of values) {
		const field = scope.plan.getField(scope.schema, value.fieldPath)
		if (field?.field !== value.field) {
			throw new TypeError(
				'Native Access field traversal resolved an inconsistent read target',
			)
		}
		// Relation collections are absent from persisted rows. Their source rule is
		// enforced before eager traversal, before an adapter can load targets.
		if (field.field.kind === 'relation') continue

		// A denied parent makes every originally collected descendant unavailable.
		const current = readRuntimeFieldValuePath(projected, value.valuePath)
		if (!current.found) continue

		const retained = fieldPathsEqual(value.fieldPath, value.valuePath)
			? readRuntimeIncludedPointerValue(projected, field.path)
			: undefined
		try {
			await assertAccessRules(
				scope,
				field.read.item,
				{ branch: 'item', field, phase: 'access-field-read' },
				immutableRecord({
					context: scope.context,
					value: retained?.present === true ? retained.value : current.value,
				}),
			)
		} catch (error: unknown) {
			if (
				!(error instanceof FrameworkError) ||
				error.code !== 'PERMISSION_DENIED'
			) {
				throw error
			}
			// A denied value is omitted rather than failing the whole read.
			const next = removeConcreteFieldPath(projected, value.valuePath)
			if (!isPlainRecord(next)) {
				throw new TypeError(
					'Native Access field projection must preserve its root record',
					{ cause: error },
				)
			}
			projected = next
		}
	}
	return projected
}

/** Applies value-dependent output restrictions without changing result shape. */
export const enforceAccessOutput = async <const TResult>(
	scope: AccessScope,
	result: TResult,
): Promise<TResult> => {
	const value: unknown = result
	let restricted: unknown = value
	if (isUnknownArray(value)) {
		const records: unknown[] = []
		for (const record of value) {
			records.push(
				isPlainRecord(record)
					? await enforceRecordOutput(scope, record)
					: record,
			)
		}
		restricted = immutableArray(records)
	} else if (isPlainRecord(value)) {
		restricted = await enforceRecordOutput(scope, value)
	}
	// Records keep their keys minus denied values and arrays keep their
	// cardinality, so the operation-specific result container is preserved.
	return restricted as TResult
}

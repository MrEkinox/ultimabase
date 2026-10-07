import {
	FrameworkError,
	collectRecordFieldValues,
	readOperationResultSelection,
	readRuntimeFieldValuePath,
	readRuntimeIncludedPointerValue,
} from '@ultimabase/core'
import { allowUndeclaredFieldAccess } from '../authoring/plan.js'
import type { AccessPlan, SchemaAccessPlan } from '../authoring/plan.js'
import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import type { AccessExecutionRuntime } from './execution-runtime.js'
import { accessFieldPathsEqual } from './field-paths.js'
import {
	assertAccessDecisionRules,
	createAccessDeniedError,
	type AccessRuntimeRequest,
} from './rule-evaluation.js'

export const computeAccessStaticSelection = (
	schemaPlan: SchemaAccessPlan,
): readonly string[] | undefined => {
	const topLevel = schemaPlan.fields.filter((field) => {
		if (field.path.length !== 1) return false

		const [fieldName] = field.path
		const definition =
			fieldName === undefined ? undefined : schemaPlan.schema.fields[fieldName]

		// Relations remain Access-controlled handles but never become row projections.
		return definition?.kind !== 'relation'
	})
	const permitted = immutableArray(
		topLevel
			.filter((field) => {
				if (field.read.item.length === 0) {
					return allowUndeclaredFieldAccess
				}

				return !field.read.item.some(({ rule }) => rule === false)
			})
			.map(({ path }) => path[0])
			.filter((field): field is string => field !== undefined),
	)

	// Leaving select-all implicit preserves optional fields when no rule narrows it.
	return permitted.length === topLevel.length ? undefined : permitted
}

export const assertAccessExplicitSelection = (
	request: AccessRuntimeRequest,
	plan: AccessPlan,
	schemaPlan: SchemaAccessPlan,
	permitted: readonly string[] | undefined,
): void => {
	if (permitted === undefined) {
		return
	}

	for (const { field: fieldName } of readOperationResultSelection(
		request.operation,
	).fields) {
		if (!permitted.includes(fieldName)) {
			const field = plan.getField(schemaPlan.schema, [fieldName])
			throw createAccessDeniedError(
				'access-field-read',
				request.operation.kind,
				field,
			)
		}
	}
}

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

const enforceRecordOutput = async (
	runtime: AccessExecutionRuntime,
	request: AccessRuntimeRequest,
	plan: AccessPlan,
	schemaPlan: SchemaAccessPlan,
	record: Readonly<Record<string, unknown>>,
): Promise<Readonly<Record<string, unknown>>> => {
	let projected = record
	const values = collectRecordFieldValues(
		schemaPlan.schema.fields,
		record,
		'parent-first',
	)

	for (const value of values) {
		const field = plan.getField(schemaPlan.schema, value.fieldPath)

		if (field?.field !== value.field) {
			throw new TypeError(
				'Native Access field traversal resolved an inconsistent read target',
			)
		}

		if (field.field.kind === 'relation') {
			// Relation collections are absent from persisted rows. Their source rule is
			// enforced before eager traversal, before an adapter can load targets.
			continue
		}

		const current = readRuntimeFieldValuePath(projected, value.valuePath)

		// A denied parent makes every originally collected descendant unavailable.
		if (!current.found) {
			continue
		}
		const retained = accessFieldPathsEqual(value.fieldPath, value.valuePath)
			? readRuntimeIncludedPointerValue(projected, field.path)
			: undefined
		const accessValue =
			retained?.present === true ? retained.value : current.value

		try {
			await assertAccessDecisionRules(
				runtime,
				request,
				field.read.item,
				{
					branch: 'item',
					field,
					phase: 'access-field-read',
					schema: schemaPlan.schema,
				},
				immutableRecord({
					context: request.context,
					value: accessValue,
				}),
				allowUndeclaredFieldAccess,
			)
		} catch (error: unknown) {
			if (
				error instanceof FrameworkError &&
				error.code === 'PERMISSION_DENIED'
			) {
				const next = removeConcreteFieldPath(projected, value.valuePath)

				if (!isPlainRecord(next)) {
					throw new TypeError(
						'Native Access field projection must preserve its root record',
						{ cause: error },
					)
				}

				projected = next
				continue
			}

			throw error
		}
	}

	return projected
}

/** Applies value-dependent output restrictions without changing result shape. */
export const enforceAccessOutput = async <const TResult>(
	runtime: AccessExecutionRuntime,
	request: AccessRuntimeRequest & {
		readonly result: TResult
	},
	plan: AccessPlan,
	schemaPlan: SchemaAccessPlan,
): Promise<TResult> => {
	const unknownResult: unknown = request.result
	const operationInput = immutableRecord({
		context: request.context,
		operation: request.operation,
	})

	if (unknownResult === null || typeof unknownResult !== 'object') {
		return request.result
	}

	if (isUnknownArray(unknownResult)) {
		const results: unknown[] = []

		for (const record of unknownResult) {
			results.push(
				isPlainRecord(record)
					? await enforceRecordOutput(
							runtime,
							operationInput,
							plan,
							schemaPlan,
							record,
						)
					: record,
			)
		}

		// Cardinality and non-record values are retained exactly from TResult.
		return immutableArray(results) as TResult
	}

	// The record branch preserves the operation-specific result container.
	return (
		isPlainRecord(unknownResult)
			? await enforceRecordOutput(
					runtime,
					operationInput,
					plan,
					schemaPlan,
					unknownResult,
				)
			: request.result
	) as TResult
}

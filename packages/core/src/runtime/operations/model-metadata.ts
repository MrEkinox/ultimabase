import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import type {
	DatabaseMutationMaterializationSource,
	DatabaseOperationAst,
	DatabaseOperationExecutor,
} from '../database/contracts.js'

/** Carries identity and projection beside public values rather than inside them. */
export interface RuntimeSchemaModelMetadata {
	readonly objectId: unknown
	readonly selectedFields: readonly string[] | undefined
}

const modelMetadata = new WeakMap<object, RuntimeSchemaModelMetadata>()
const includedPointerValues = new WeakMap<
	object,
	ReadonlyMap<string, unknown>
>()
const collectionKinds = new Set(['create-many', 'find-many', 'upsert-many'])
const recordKinds = new Set([
	'create-many',
	'create-one',
	'delete-one',
	'find-many',
	'find-one',
	'get',
	'update-one',
	'upsert-many',
	'upsert-one',
])

const retainedFieldPathKey = (fieldPath: readonly string[]): string =>
	JSON.stringify(fieldPath)

const absentRetainedFieldValue: Readonly<{ readonly present: false }> =
	immutableRecord({ present: false as const })

/** Distinguishes an absent private value from one explicitly retained as undefined. */
export type RuntimeRetainedFieldValue =
	| typeof absentRetainedFieldValue
	| Readonly<{ readonly present: true; readonly value: unknown }>

const collectResultRecords = (
	operation: DatabaseOperationAst,
	result: unknown,
): readonly Readonly<Record<string, unknown>>[] => {
	if (!recordKinds.has(operation.kind) || result === null) {
		return immutableArray([])
	}

	const records: unknown = result

	if (collectionKinds.has(operation.kind)) {
		if (!isUnknownArray(records)) {
			return immutableArray([])
		}

		return immutableArray(records.filter(isPlainRecord))
	}

	return isPlainRecord(records) ? immutableArray([records]) : immutableArray([])
}

const collectMutationIdentityRecords = (
	outcome: DatabaseMutationMaterializationSource | undefined,
): readonly Readonly<Record<string, unknown>>[] => {
	if (outcome === undefined) {
		return immutableArray([])
	}

	return immutableArray(
		outcome.materializations.map((materialization) =>
			materialization.kind === 'delete'
				? materialization.previous
				: materialization.current,
		),
	)
}

/** Reads identity through an adapter side channel before falling back to visible id. */
export const collectDatabaseObjectIdentities = (
	executor: DatabaseOperationExecutor,
	operation: DatabaseOperationAst,
	result: unknown,
	outcome?: DatabaseMutationMaterializationSource,
): readonly unknown[] => {
	const mutationRecords = collectMutationIdentityRecords(outcome)
	const records =
		mutationRecords.length > 0
			? mutationRecords
			: collectResultRecords(operation, result)

	return immutableArray(
		records.map((record) => {
			const retained = executor.readObjectIdentity?.(record)

			return retained ?? (Object.hasOwn(record, 'id') ? record.id : undefined)
		}),
	)
}

/** Associates final public records with adapter-proven identity by stable result index. */
export const retainRuntimeSchemaModelMetadata = (
	operation: DatabaseOperationAst,
	objectIdentities: readonly unknown[],
	result: unknown,
	selectedFields: readonly string[] | undefined,
): void => {
	const finalRecords = collectResultRecords(operation, result)
	const selectionSnapshot =
		selectedFields === undefined ? undefined : immutableArray(selectedFields)

	for (const [index, record] of finalRecords.entries()) {
		modelMetadata.set(
			record,
			immutableRecord({
				objectId: objectIdentities[index],
				selectedFields: selectionSnapshot,
			}),
		)
	}
}

/** Reads metadata only for the exact final record retained by Runtime. */
export const readRuntimeSchemaModelMetadata = (
	record: object,
): RuntimeSchemaModelMetadata | undefined => modelMetadata.get(record)

/** Uses a protected model's effective projection when one has been retained. */
export const resolveSelectedFields = (
	value: unknown,
	fallback: readonly string[] | undefined,
): readonly string[] | undefined => {
	if (!isPlainRecord(value)) return fallback
	const metadata = modelMetadata.get(value)
	return metadata === undefined ? fallback : metadata.selectedFields
}

/** Retains the declared pointer value after its public field becomes hydrated. */
export const retainRuntimeIncludedPointerValue = (
	record: object,
	fieldPath: readonly string[],
	value: unknown,
): void => {
	const values = new Map(includedPointerValues.get(record))

	values.set(retainedFieldPathKey(fieldPath), value)
	includedPointerValues.set(record, values)
}

/** Restores the declared pointer value for final field policy evaluation. */
export const readRuntimeIncludedPointerValue = (
	record: object,
	fieldPath: readonly string[],
): RuntimeRetainedFieldValue => {
	const values = includedPointerValues.get(record)
	const key = retainedFieldPathKey(fieldPath)

	if (!values?.has(key)) {
		return absentRetainedFieldValue
	}

	return immutableRecord({ present: true as const, value: values.get(key) })
}

/** Preserves adapter-proven identity when Runtime replaces a record after behaviors. */
export const transferRuntimeSchemaModelMetadata = (
	source: object,
	target: object,
): void => {
	const metadata = modelMetadata.get(source)
	const pointerValues = includedPointerValues.get(source)

	if (metadata !== undefined) {
		modelMetadata.set(target, metadata)
	}
	if (pointerValues !== undefined) {
		includedPointerValues.set(target, pointerValues)
	}
}

/** Preserves identity while recording a protected narrowing of visible fields. */
export const narrowRuntimeSchemaModelMetadata = (
	source: object,
	target: object,
	permittedFields: readonly string[],
): void => {
	transferRuntimeSchemaModelMetadata(source, target)

	const metadata = modelMetadata.get(source)
	if (metadata === undefined) return

	const selectedFields =
		metadata.selectedFields === undefined
			? permittedFields
			: metadata.selectedFields.filter((field) =>
					permittedFields.includes(field),
				)
	modelMetadata.set(
		target,
		immutableRecord({
			objectId: metadata.objectId,
			selectedFields: immutableArray(selectedFields),
		}),
	)
}

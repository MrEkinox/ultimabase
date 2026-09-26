import type { OperationKind } from '../../query/index.js'
import { isDeepStrictEqual } from 'node:util'
import {
	Schema,
	type SchemaDefinition,
	type ValidationIssuePath,
} from '../../schema/index.js'
import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'
import type { DatabaseOperationAst } from '../database/contracts.js'
import { getOperationSchema } from '../operations/schema.js'
import {
	throwRuntimeValidationIssues,
	type RuntimeValidationErrorDescription,
	type RuntimeValidationIssue,
} from '../validation/runtime-validation.js'

export const behaviorBoundaryErrorDescription: Readonly<RuntimeValidationErrorDescription> =
	immutableRecord({
		internalMessage: 'Runtime behavior boundary validation failed.',
		publicMessage: 'A Runtime behavior returned an invalid value.',
	})

export const adapterBoundaryErrorDescription: Readonly<RuntimeValidationErrorDescription> =
	immutableRecord({
		internalMessage: 'Database adapter outcome validation failed.',
		publicMessage: 'The database operation returned an invalid result.',
	})

const createBoundaryIssue = (
	path: ValidationIssuePath,
	message: string,
): RuntimeValidationIssue =>
	immutableRecord({
		code: 'runtime.behavior-boundary.invalid',
		message,
		path: immutableArray(path),
	})

export const throwBoundaryIssue = (
	path: ValidationIssuePath,
	message: string,
	description: Readonly<RuntimeValidationErrorDescription> = behaviorBoundaryErrorDescription,
): never =>
	throwRuntimeValidationIssues(
		[createBoundaryIssue(path, message)],
		description,
	)

export const assertExactKeys = (
	value: Readonly<Record<string, unknown>>,
	keys: readonly string[],
	path: ValidationIssuePath,
	description: Readonly<RuntimeValidationErrorDescription> = behaviorBoundaryErrorDescription,
	optionalKeys: readonly string[] = immutableArray([]),
): void => {
	const expectedKeys = new Set([...keys, ...optionalKeys])

	for (const key of Object.keys(value)) {
		if (!expectedKeys.has(key)) {
			throwBoundaryIssue(
				[...path, key],
				'Property is not part of this boundary contract',
				description,
			)
		}
	}

	for (const key of keys) {
		if (!Object.hasOwn(value, key)) {
			throwBoundaryIssue(
				[...path, key],
				'Required boundary property is missing',
				description,
			)
		}
	}
}

export const readOptionalOperationKeys = (
	kind: OperationKind,
): readonly string[] =>
	kind === 'create-one' ? immutableArray(['inclusion']) : immutableArray([])

export const readOperationSchema = (
	operation: unknown,
	path: ValidationIssuePath,
): SchemaDefinition => {
	let value: unknown

	try {
		value = getOperationSchema(operation)
	} catch {
		return throwBoundaryIssue(path, 'Operation must retain a normalized schema')
	}

	if (!Schema.is(value)) {
		return throwBoundaryIssue(path, 'Operation must retain a declared schema')
	}

	return value
}

export const readOperationKeys = (kind: OperationKind): readonly string[] => {
	switch (kind) {
		case 'count':
		case 'delete-many':
		case 'delete-one':
		case 'exists':
		case 'find-many':
		case 'find-one':
			return ['kind', 'query']
		case 'get':
			return ['kind', 'query', 'id']
		case 'create-one':
			return ['kind', 'schema', 'input', 'selection']
		case 'create-many':
			return ['kind', 'schema', 'inputs', 'selection']
		case 'update-many':
		case 'update-one':
			return ['kind', 'query', 'update']
		case 'upsert-one':
			return ['kind', 'query', 'target', 'create', 'update']
		case 'upsert-many':
			return ['kind', 'schema', 'items', 'selection']
	}
}

export const assertSameQueryResultShape = (
	operation: DatabaseOperationAst,
	replacement: Readonly<Record<string, unknown>>,
): void => {
	const original: unknown = operation

	if (
		isPlainRecord(original) &&
		(original.kind === 'create-one' ||
			original.kind === 'create-many' ||
			original.kind === 'upsert-many')
	) {
		if (!isDeepStrictEqual(original.selection, replacement.selection)) {
			throwBoundaryIssue(
				['operation', 'selection'],
				'Runtime behavior must retain the exact create selection',
			)
		}

		if (
			original.kind === 'create-one' &&
			!isDeepStrictEqual(original.inclusion, replacement.inclusion)
		) {
			throwBoundaryIssue(
				['operation', 'inclusion'],
				'Runtime behavior must retain the exact create inclusion',
			)
		}

		return
	}

	if (
		!isPlainRecord(original) ||
		!isPlainRecord(original.query) ||
		!isPlainRecord(replacement.query)
	) {
		return
	}

	if (
		!isDeepStrictEqual(original.query.selection, replacement.query.selection)
	) {
		throwBoundaryIssue(
			['operation', 'query', 'selection'],
			'Runtime behavior must retain the exact query selection',
		)
	}

	if (
		!isDeepStrictEqual(original.query.inclusion, replacement.query.inclusion)
	) {
		throwBoundaryIssue(
			['operation', 'query', 'inclusion'],
			'Runtime behavior must retain the exact query inclusion',
		)
	}
}

export const snapshotBoundaryValue = (
	value: unknown,
	path: ValidationIssuePath,
	ancestors: WeakSet<object>,
): unknown => {
	if (isUnknownArray(value)) {
		if (ancestors.has(value)) {
			return throwBoundaryIssue(path, 'Boundary value cannot contain a cycle')
		}

		ancestors.add(value)

		try {
			return immutableArray(
				value.map((item, index) =>
					snapshotBoundaryValue(item, [...path, index], ancestors),
				),
			)
		} finally {
			ancestors.delete(value)
		}
	}

	if (!isPlainRecord(value)) {
		// Schema definitions and scalar capabilities retain identity outside plain AST data.
		return value
	}

	if (ancestors.has(value)) {
		return throwBoundaryIssue(path, 'Boundary value cannot contain a cycle')
	}

	ancestors.add(value)

	try {
		return immutableRecord(
			Object.fromEntries(
				Object.entries(value).map(([key, item]) => [
					key,
					snapshotBoundaryValue(item, [...path, key], ancestors),
				]),
			),
		)
	} finally {
		ancestors.delete(value)
	}
}

export const readSelectedFields = (
	operation: DatabaseOperationAst,
	schema: SchemaDefinition,
): readonly string[] | undefined => {
	const candidate: unknown = operation

	if (!isPlainRecord(candidate)) {
		return undefined
	}
	const selectionPath: ValidationIssuePath =
		candidate.kind === 'create-one' ||
		candidate.kind === 'create-many' ||
		candidate.kind === 'upsert-many'
			? ['operation', 'selection']
			: ['operation', 'query', 'selection']
	const selection: unknown =
		candidate.kind === 'create-one' ||
		candidate.kind === 'create-many' ||
		candidate.kind === 'upsert-many'
			? candidate.selection
			: isPlainRecord(candidate.query)
				? candidate.query.selection
				: undefined

	if (selection === undefined) {
		return undefined
	}

	if (!isPlainRecord(selection) || !isUnknownArray(selection.fields)) {
		return throwBoundaryIssue(
			selectionPath,
			'Operation selection must be normalized',
		)
	}

	const selectedFields: string[] = []

	for (const [index, selected] of selection.fields.entries()) {
		if (
			!isPlainRecord(selected) ||
			selected.kind !== 'selected-field' ||
			typeof selected.field !== 'string' ||
			!Object.hasOwn(schema.fields, selected.field)
		) {
			return throwBoundaryIssue(
				[...selectionPath, 'fields', index],
				'Selected field must reference the operation schema',
			)
		}

		selectedFields.push(selected.field)
	}

	return selectedFields.length === 0
		? undefined
		: immutableArray(selectedFields)
}

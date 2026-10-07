import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
} from '@ultimabase/shared'

import { FrameworkError } from '../../foundation.js'
import {
	snapshotOutputValue,
	type SchemaDefinition,
	type ValidationIssuePath,
} from '../../schema/index.js'

const throwVirtualBoundaryIssue = (
	path: ValidationIssuePath,
	message: string,
): never => {
	const issue = immutableRecord({
		code: 'runtime.behavior-boundary.invalid',
		message,
		path: immutableArray(path),
	})
	throw new FrameworkError(
		'VALIDATION_ERROR',
		'Runtime behavior boundary validation failed.',
		{
			publicMessage: 'A Runtime behavior returned an invalid value.',
			publicDetails: { issues: immutableArray([issue]) },
			internalDetails: { issues: immutableArray([issue]) },
		},
	)
}

/** Separates and snapshots virtual values before persisted record validation. */
export const separateRuntimeVirtualResult = (
	schema: SchemaDefinition,
	value: unknown,
	path: ValidationIssuePath,
	selectedFields: readonly string[] | undefined,
): Readonly<{
	readonly persisted: unknown
	readonly virtual: Readonly<Record<string, unknown>>
}> => {
	if (!isPlainRecord(value)) {
		return immutableRecord({ persisted: value, virtual: immutableRecord({}) })
	}

	const selected =
		selectedFields === undefined ? undefined : new Set(selectedFields)
	const requested = Object.entries(schema.virtualFields).filter(
		([name]) => selected === undefined || selected.has(name),
	)
	const persisted: Record<string, unknown> = { ...value }
	const virtual: Record<string, unknown> = {}

	for (const [name] of Object.entries(schema.virtualFields)) {
		if (!Object.hasOwn(value, name)) continue
		Reflect.deleteProperty(persisted, name)
		if (selected !== undefined && !selected.has(name)) {
			throwVirtualBoundaryIssue(
				[...path, name],
				'Virtual field is not part of this result projection',
			)
		}
	}

	for (const [name, field] of requested) {
		if (!Object.hasOwn(value, name)) {
			throwVirtualBoundaryIssue(
				[...path, name],
				'Requested virtual field is missing',
			)
		}
		try {
			virtual[name] = snapshotOutputValue(
				field.output,
				value[name],
				`${schema.className}.${name}`,
			)
		} catch (error: unknown) {
			throw new FrameworkError(
				'VALIDATION_ERROR',
				`Runtime behavior returned an invalid virtual field: ${schema.className}.${name}`,
				{
					cause: error,
					publicMessage: 'A Runtime behavior returned an invalid value.',
					internalDetails: { className: schema.className, field: name },
				},
			)
		}
	}

	return immutableRecord({
		persisted: immutableRecord(persisted),
		virtual: immutableRecord(virtual),
	})
}

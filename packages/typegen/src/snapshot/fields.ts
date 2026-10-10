import {
	getPluginFieldStorageCodec,
	getPluginFieldStructuralContains,
	readFieldTypegenState,
	type CompiledSchemaRegistry,
	type GenericField,
	type OwnedPluginFieldType,
	type SchemaDefinition,
} from '@ultimabase/core'
import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import { SchemaTypegenError } from '../errors.js'
import type {
	TypegenFieldSnapshot,
	TypegenReference,
	TypegenValueNode,
} from '../snapshot.js'

/** Copies one type reference without retaining the plugin-owned object. */
export const snapshotReference = (
	exportName: string,
	module: string,
): TypegenReference => immutableRecord({ exportName, module })

interface PluginValueReference extends TypegenReference {
	readonly owner: string
	readonly structuralContains: TypegenReference | undefined
}

export interface FieldSnapshotContext {
	readonly pluginValues: ReadonlyMap<string, PluginValueReference>
	readonly schemas: CompiledSchemaRegistry
}

/** Indexes plugin field kinds, rejecting two different public value types for one kind. */
export const createPluginValueReferences = (
	pluginFieldTypes: readonly OwnedPluginFieldType[],
): ReadonlyMap<string, PluginValueReference> => {
	const references = new Map<string, PluginValueReference>()

	for (const { fieldKind, owner, typegen } of pluginFieldTypes) {
		const existing = references.get(fieldKind)
		const structuralContains = typegen.structuralContainsType

		// The containment reference shares the value module, so comparing the
		// three declared names is the same as comparing both copied references.
		if (
			existing !== undefined &&
			(existing.exportName !== typegen.valueType ||
				existing.module !== typegen.module ||
				existing.structuralContains?.exportName !== structuralContains)
		) {
			throw new SchemaTypegenError(
				'malformed-plugin-contribution',
				`Field kind "${fieldKind}" from "${owner}" conflicts with the value type declared by "${existing.owner}"`,
				{ owner },
			)
		}

		references.set(
			fieldKind,
			immutableRecord({
				exportName: typegen.valueType,
				module: typegen.module,
				owner,
				structuralContains:
					structuralContains === undefined
						? undefined
						: snapshotReference(structuralContains, typegen.module),
			}),
		)
	}

	return references
}

export const unsupported = (
	message: string,
	path: string,
): SchemaTypegenError =>
	new SchemaTypegenError('unsupported-field-kind', message, { path })

/** Maps built-in kinds whose generated value carries no field metadata. */
const scalarValueKinds = new Map<
	string,
	Exclude<
		TypegenValueNode['kind'],
		'enum' | 'object' | 'plugin' | 'pointer' | 'relation'
	>
>([
	['bigint', 'bigint'],
	['binary', 'bytes'],
	['boolean', 'boolean'],
	['date', 'string'],
	['dateTime', 'string'],
	['decimal', 'string'],
	['float', 'number'],
	['int', 'number'],
	['json', 'json'],
	['string', 'string'],
	['time', 'string'],
	['uuid', 'string'],
])

export const scalarValue = (kind: string): TypegenValueNode | undefined => {
	const scalar = scalarValueKinds.get(kind)

	return scalar === undefined ? undefined : immutableRecord({ kind: scalar })
}

export const pluginValue = (
	kind: string,
	subject: string,
	displayPath: string,
	context: FieldSnapshotContext,
): TypegenValueNode => {
	const reference = context.pluginValues.get(kind)

	if (reference === undefined) {
		throw unsupported(
			`${subject} ${displayPath} uses "${kind}" without a configured typegen contribution`,
			displayPath,
		)
	}

	return immutableRecord({
		kind: 'plugin',
		reference: snapshotReference(reference.exportName, reference.module),
	})
}

export const readOptionalString = (
	value: unknown,
	path: string,
): string | undefined => {
	if (value !== undefined && typeof value !== 'string') {
		throw unsupported(`${path} must be a string`, path)
	}

	return value
}

export const displayPathOf = (
	schema: SchemaDefinition,
	path: readonly string[],
): string => `${schema.className}.${path.join('.')}`

export const sortedEntries = <TValue>(
	record: Readonly<Record<string, TValue>>,
): [string, TValue][] =>
	Object.entries(record).sort(([left], [right]) => left.localeCompare(right))

const readEnumValues = (
	field: GenericField,
	path: string,
): readonly string[] => {
	const values: unknown =
		'values' in field.options ? field.options.values : undefined
	const resolved = isUnknownArray(values)
		? values
		: isPlainRecord(values)
			? Object.values(values)
			: undefined

	if (resolved === undefined) {
		throw unsupported(`Enum field ${path} has no stable values`, path)
	}

	if (!resolved.every((value) => typeof value === 'string')) {
		throw unsupported(
			`Enum field ${path} contains a non-string ${isUnknownArray(values) ? 'value' : 'mapping'}`,
			path,
		)
	}

	return immutableArray([...resolved].sort())
}

const snapshotValue = (
	field: GenericField,
	schema: SchemaDefinition,
	path: readonly string[],
	context: FieldSnapshotContext,
): TypegenValueNode => {
	const displayPath = displayPathOf(schema, path)
	const options: object = field.options
	const typeName = (): string | undefined =>
		readOptionalString(
			'typeName' in options ? options.typeName : undefined,
			`${displayPath}.typeName`,
		)

	switch (field.kind) {
		case 'enum': {
			// A shared enum (ADR-0310) names one generated type for every field.
			const shared: unknown =
				'sharedEnum' in options ? options.sharedEnum : undefined
			return immutableRecord({
				kind: 'enum',
				typeName: readOptionalString(
					typeof shared === 'object' && shared !== null
						? Reflect.get(shared, 'name')
						: undefined,
					`${displayPath}.sharedEnum.name`,
				),
				values: readEnumValues(field, displayPath),
			})
		}
		case 'object': {
			const fields: unknown = 'fields' in options ? options.fields : undefined

			if (!isPlainRecord(fields)) {
				throw unsupported(
					`Object field ${displayPath} has no stable child fields`,
					displayPath,
				)
			}

			return immutableRecord({
				fields: snapshotFields(fields, schema, path, context),
				kind: 'object',
				typeName: typeName(),
			})
		}
		case 'pointer':
		case 'relation': {
			const target = context.schemas.schemaTargets.get(schema, path)

			if (target === undefined) {
				throw unsupported(
					`Relationship field ${displayPath} has no resolved target`,
					displayPath,
				)
			}

			return field.kind === 'pointer'
				? immutableRecord({ kind: 'pointer', target: target.className })
				: immutableRecord({
						kind: 'relation',
						mappedBy: readOptionalString(
							'mappedBy' in options ? options.mappedBy : undefined,
							`${displayPath}.mappedBy`,
						),
						target: target.className,
					})
		}
		default:
			return (
				scalarValue(field.kind) ??
				pluginValue(field.kind, 'Field', displayPath, context)
			)
	}
}

/** Snapshots compiled stored fields in name order, recursing into embedded objects. */
export const snapshotFields = (
	fields: Readonly<Record<string, unknown>>,
	schema: SchemaDefinition,
	parentPath: readonly string[],
	context: FieldSnapshotContext,
): readonly TypegenFieldSnapshot[] =>
	immutableArray(
		sortedEntries(fields).map(([name, candidate]) => {
			const path = immutableArray([...parentPath, name])
			const displayPath = displayPathOf(schema, path)

			if (
				typeof candidate !== 'object' ||
				candidate === null ||
				!('kind' in candidate) ||
				!('options' in candidate) ||
				typeof candidate.kind !== 'string' ||
				typeof candidate.options !== 'object' ||
				candidate.options === null
			) {
				throw unsupported(
					`Field ${displayPath} is not a compiled logical field`,
					displayPath,
				)
			}

			// The checks above prove the GenericField shape; the original object is
			// kept because Core reads field capabilities by identity.
			const field = candidate as GenericField
			const containment = getPluginFieldStructuralContains(field)
			const structuralContains = context.pluginValues.get(
				field.kind,
			)?.structuralContains

			if (containment !== undefined && structuralContains === undefined) {
				throw new SchemaTypegenError(
					'malformed-plugin-contribution',
					`Field ${displayPath} enables structural containment without a declared operand type`,
					{ path: displayPath },
				)
			}

			return immutableRecord({
				description:
					'description' in field.options &&
					typeof field.options.description === 'string'
						? field.options.description
						: undefined,
				kind: field.kind,
				name,
				path,
				portableEquality: getPluginFieldStorageCodec(field) !== undefined,
				structuralContains:
					containment === undefined ? undefined : structuralContains,
				typegen: readFieldTypegenState(field),
				value: snapshotValue(field, schema, path, context),
			})
		}),
	)

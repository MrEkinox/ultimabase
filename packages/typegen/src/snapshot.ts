import {
	getPluginFieldStructuralContains,
	getPluginFieldStorageCodec,
	readFieldTypegenState,
	type CompiledSchemaRegistry,
	type CompiledTypegenGraph,
	type FieldTypegenState,
	type FrameworkApplication,
	type GenericField,
	type JsonValue,
	type OwnedFieldBuilderMethod,
	type OwnedPluginFieldType,
	type PluginDefinition,
	type SchemaDefinition,
	type TypegenNamedDeclaration,
	type TypegenPropertyNode,
} from '@ultimabase/core'
import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import { SchemaTypegenError } from './errors.js'
import { snapshotTypegenGraph } from './snapshot/plugin-graph.js'

export interface TypegenReference {
	readonly exportName: string
	readonly module: string
}

export type TypegenValueNode =
	| { readonly kind: 'bigint' }
	| { readonly kind: 'boolean' }
	| { readonly kind: 'bytes' }
	| {
			readonly kind: 'enum'
			readonly typeName: string | undefined
			readonly values: readonly string[]
	  }
	| { readonly kind: 'json' }
	| {
			readonly fields: readonly TypegenFieldSnapshot[]
			readonly kind: 'object'
			readonly typeName: string | undefined
	  }
	| { readonly kind: 'number' }
	| { readonly kind: 'plugin'; readonly reference: TypegenReference }
	| { readonly kind: 'pointer'; readonly target: string }
	| {
			readonly kind: 'relation'
			readonly mappedBy: string | undefined
			readonly target: string
	  }
	| { readonly kind: 'string' }

export interface TypegenFieldSnapshot {
	readonly description: string | undefined
	readonly kind: string
	readonly name: string
	readonly path: readonly string[]
	/** Grants complete-value equality only through the field's portable JSON codec. */
	readonly portableEquality: boolean
	/** Names the plugin-owned partial operand without retaining its callback. */
	readonly structuralContains: TypegenReference | undefined
	readonly typegen: FieldTypegenState
	readonly value: TypegenValueNode
}

export interface TypegenSchemaSnapshot {
	readonly className: string
	readonly fields: readonly TypegenFieldSnapshot[]
}

export interface TypegenFieldMethodSnapshot {
	readonly fieldKind: string
	readonly method: TypegenReference
	readonly name: string
	readonly owner: string
	readonly structuralContains: TypegenReference | undefined
	readonly value: TypegenReference
}

export interface TypegenOwnerSnapshot {
	readonly instanceId?: string
	readonly pluginId: string
	readonly version: string
}

export interface TypegenOptionSnapshot {
	readonly contributionId: string
	readonly name: string
	readonly owner: TypegenOwnerSnapshot
	readonly reference: TypegenReference
	readonly generic?: 'self'
	readonly scope: 'field' | 'schema'
	readonly staticOptions: Readonly<Record<string, JsonValue>>
}

export interface TypegenOperationSnapshot {
	readonly errors: readonly string[]
	readonly input: TypegenReference | undefined
	readonly name: string
	readonly owner: TypegenOwnerSnapshot
	readonly result: TypegenReference | undefined
	readonly target: 'application' | 'model' | 'schema'
	readonly transaction: 'forbidden' | 'optional' | 'required'
	readonly version: string
}

export interface TypegenCommandSnapshot {
	readonly contributionId: string
	readonly name: string
	readonly operation: string
	readonly owner: TypegenOwnerSnapshot
	readonly staticOptions: Readonly<Record<string, JsonValue>>
}

export interface TypegenQueryExtensionSnapshot {
	readonly contributionId: string
	readonly input: TypegenReference | undefined
	readonly name: string
	readonly owner: TypegenOwnerSnapshot
	readonly staticOptions: Readonly<Record<string, JsonValue>>
	readonly version: string
}

export interface TypegenSchemaSurfaceSnapshot {
	readonly className: string
	readonly modelCommands: readonly TypegenCommandSnapshot[]
	readonly queryExtensions: readonly TypegenQueryExtensionSnapshot[]
	readonly schemaCommands: readonly TypegenCommandSnapshot[]
}

export interface TypegenContributionSnapshot {
	readonly augmentations: readonly Readonly<{
		readonly model?: readonly TypegenPropertyNode[]
		readonly schema?: readonly TypegenPropertyNode[]
		readonly target: string
	}>[]
	readonly contributionId: string
	readonly declarations: readonly TypegenNamedDeclaration[]
	readonly owner: TypegenOwnerSnapshot
	readonly staticOptions: Readonly<Record<string, JsonValue>>
}

export interface TypegenOutputSnapshot {
	readonly contributionId: string
	readonly declarations?: readonly TypegenNamedDeclaration[]
	readonly kind: 'declaration' | 'metadata'
	readonly metadata?: JsonValue
	readonly outputPath: string
	readonly owner: TypegenOwnerSnapshot
	readonly staticOptions: Readonly<Record<string, JsonValue>>
}

export interface TypegenApplicationSnapshot {
	readonly applicationId: string
	readonly contributions: readonly TypegenContributionSnapshot[]
	readonly fieldMethods: readonly TypegenFieldMethodSnapshot[]
	readonly operations: readonly TypegenOperationSnapshot[]
	readonly options: readonly TypegenOptionSnapshot[]
	readonly outputs: readonly TypegenOutputSnapshot[]
	readonly schemas: readonly TypegenSchemaSnapshot[]
	readonly surfaces: readonly TypegenSchemaSurfaceSnapshot[]
	readonly version: 6
}

interface PluginValueReference extends TypegenReference {
	readonly owner: string
	readonly structuralContains: TypegenReference | undefined
}

const readDescription = (field: GenericField): string | undefined =>
	'description' in field.options &&
	typeof field.options.description === 'string'
		? field.options.description
		: undefined

const readEnumValues = (
	field: GenericField,
	path: string,
): readonly string[] => {
	const values: unknown =
		'values' in field.options ? field.options.values : undefined

	if (isUnknownArray(values)) {
		if (!values.every((value) => typeof value === 'string')) {
			throw new SchemaTypegenError(
				'unsupported-field-kind',
				`Enum field ${path} contains a non-string value`,
				{ path },
			)
		}

		return immutableArray([...values].sort())
	}

	if (isPlainRecord(values)) {
		const resolved = Object.values(values)

		if (!resolved.every((value) => typeof value === 'string')) {
			throw new SchemaTypegenError(
				'unsupported-field-kind',
				`Enum field ${path} contains a non-string mapping`,
				{ path },
			)
		}

		return immutableArray([...resolved].sort())
	}

	throw new SchemaTypegenError(
		'unsupported-field-kind',
		`Enum field ${path} has no stable values`,
		{ path },
	)
}

const readOptionalString = (
	value: unknown,
	path: string,
): string | undefined => {
	if (value === undefined) {
		return undefined
	}

	if (typeof value !== 'string') {
		throw new SchemaTypegenError(
			'unsupported-field-kind',
			`${path} must be a string`,
			{ path },
		)
	}

	return value
}

const createPluginValueReferences = (
	pluginFieldTypes: readonly OwnedPluginFieldType[],
): ReadonlyMap<string, PluginValueReference> => {
	const references = new Map<string, PluginValueReference>()

	for (const fieldType of pluginFieldTypes) {
		const existing = references.get(fieldType.fieldKind)
		const candidate = immutableRecord({
			exportName: fieldType.typegen.valueType,
			module: fieldType.typegen.module,
			owner: fieldType.owner,
			structuralContains:
				fieldType.typegen.structuralContainsType === undefined
					? undefined
					: immutableRecord({
							exportName: fieldType.typegen.structuralContainsType,
							module: fieldType.typegen.module,
						}),
		})

		if (
			existing !== undefined &&
			(existing.exportName !== candidate.exportName ||
				existing.module !== candidate.module ||
				existing.structuralContains?.exportName !==
					candidate.structuralContains?.exportName ||
				existing.structuralContains?.module !==
					candidate.structuralContains?.module)
		) {
			throw new SchemaTypegenError(
				'malformed-plugin-contribution',
				`Field kind "${fieldType.fieldKind}" from "${fieldType.owner}" conflicts with the value type declared by "${existing.owner}"`,
				{ owner: fieldType.owner },
			)
		}

		references.set(fieldType.fieldKind, candidate)
	}

	return references
}

interface SnapshotContext {
	readonly pluginValues: ReadonlyMap<string, PluginValueReference>
	readonly schemas: CompiledSchemaRegistry
}

const snapshotValue = (
	field: GenericField,
	schema: SchemaDefinition,
	path: readonly string[],
	context: SnapshotContext,
): TypegenValueNode => {
	const displayPath = `${schema.className}.${path.join('.')}`

	switch (field.kind) {
		case 'bigint':
			return immutableRecord({ kind: 'bigint' })
		case 'binary':
			return immutableRecord({ kind: 'bytes' })
		case 'boolean':
			return immutableRecord({ kind: 'boolean' })
		case 'date':
		case 'dateTime':
		case 'decimal':
		case 'string':
		case 'time':
		case 'uuid':
			return immutableRecord({ kind: 'string' })
		case 'enum':
			return immutableRecord({
				kind: 'enum',
				typeName: readOptionalString(
					'typeName' in field.options ? field.options.typeName : undefined,
					`${displayPath}.typeName`,
				),
				values: readEnumValues(field, displayPath),
			})
		case 'float':
		case 'int':
			return immutableRecord({ kind: 'number' })
		case 'json':
			return immutableRecord({ kind: 'json' })
		case 'object': {
			const fields: unknown =
				'fields' in field.options ? field.options.fields : undefined

			if (!isPlainRecord(fields)) {
				throw new SchemaTypegenError(
					'unsupported-field-kind',
					`Object field ${displayPath} has no stable child fields`,
					{ path: displayPath },
				)
			}

			return immutableRecord({
				fields: snapshotFields(fields, schema, path, context),
				kind: 'object',
				typeName: readOptionalString(
					'typeName' in field.options ? field.options.typeName : undefined,
					`${displayPath}.typeName`,
				),
			})
		}
		case 'pointer':
		case 'relation': {
			const target = context.schemas.schemaTargets.get(schema, path)

			if (target === undefined) {
				throw new SchemaTypegenError(
					'unsupported-field-kind',
					`Relationship field ${displayPath} has no resolved target`,
					{ path: displayPath },
				)
			}

			return field.kind === 'pointer'
				? immutableRecord({ kind: 'pointer', target: target.className })
				: immutableRecord({
						kind: 'relation',
						mappedBy: readOptionalString(
							'mappedBy' in field.options ? field.options.mappedBy : undefined,
							`${displayPath}.mappedBy`,
						),
						target: target.className,
					})
		}
		default: {
			const reference = context.pluginValues.get(field.kind)

			if (reference === undefined) {
				throw new SchemaTypegenError(
					'unsupported-field-kind',
					`Field ${displayPath} uses "${field.kind}" without a configured typegen contribution`,
					{ path: displayPath },
				)
			}

			return immutableRecord({
				kind: 'plugin',
				reference: immutableRecord({
					exportName: reference.exportName,
					module: reference.module,
				}),
			})
		}
	}
}

const snapshotFields = (
	fields: Readonly<Record<string, unknown>>,
	schema: SchemaDefinition,
	parentPath: readonly string[],
	context: SnapshotContext,
): readonly TypegenFieldSnapshot[] =>
	immutableArray(
		Object.entries(fields)
			.sort(([left], [right]) => left.localeCompare(right))
			.map(([name, candidate]) => {
				if (
					typeof candidate !== 'object' ||
					candidate === null ||
					!('kind' in candidate) ||
					!('options' in candidate) ||
					typeof candidate.kind !== 'string' ||
					typeof candidate.options !== 'object' ||
					candidate.options === null
				) {
					const invalidPath = `${schema.className}.${[...parentPath, name].join('.')}`

					throw new SchemaTypegenError(
						'unsupported-field-kind',
						`Field ${invalidPath} is not a compiled logical field`,
						{ path: invalidPath },
					)
				}

				const field = candidate as GenericField
				const path = immutableArray([...parentPath, name])
				const containment = getPluginFieldStructuralContains(field)
				const pluginReference = context.pluginValues.get(field.kind)

				if (
					containment !== undefined &&
					pluginReference?.structuralContains === undefined
				) {
					const displayPath = `${schema.className}.${path.join('.')}`

					throw new SchemaTypegenError(
						'malformed-plugin-contribution',
						`Field ${displayPath} enables structural containment without a declared operand type`,
						{ path: displayPath },
					)
				}

				return immutableRecord({
					description: readDescription(field),
					kind: field.kind,
					name,
					path,
					portableEquality: getPluginFieldStorageCodec(field) !== undefined,
					structuralContains:
						containment === undefined
							? undefined
							: pluginReference?.structuralContains,
					typegen: readFieldTypegenState(field),
					value: snapshotValue(field, schema, path, context),
				})
			}),
	)

export interface CompiledTypegenApplication {
	readonly fieldBuilderMethods: readonly OwnedFieldBuilderMethod[]
	readonly pluginFieldTypes: readonly OwnedPluginFieldType[]
	readonly schemas: CompiledSchemaRegistry
	readonly typegenGraph?: CompiledTypegenGraph
}

/** Converts an already compiled application graph into an inert snapshot. */
export const createCompiledTypegenSnapshot = (
	application: CompiledTypegenApplication,
	applicationId: string,
): TypegenApplicationSnapshot => {
	if (applicationId.trim() === '') {
		throw new TypeError('applicationId must be a non-empty string')
	}

	const pluginValues = createPluginValueReferences(application.pluginFieldTypes)
	const context: SnapshotContext = {
		pluginValues,
		schemas: application.schemas,
	}
	const fieldMethods = immutableArray(
		[...application.fieldBuilderMethods]
			.sort((left, right) => left.name.localeCompare(right.name))
			.map((method) =>
				immutableRecord({
					fieldKind: method.fieldKind,
					method: immutableRecord({
						exportName: method.typegen.methodType,
						module: method.typegen.module,
					}),
					name: method.name,
					owner: method.owner,
					structuralContains:
						method.typegen.structuralContainsType === undefined
							? undefined
							: immutableRecord({
									exportName: method.typegen.structuralContainsType,
									module: method.typegen.module,
								}),
					value: immutableRecord({
						exportName: method.typegen.valueType,
						module: method.typegen.module,
					}),
				}),
			),
	)
	const schemas = immutableArray(
		[...application.schemas.values()]
			.sort((left, right) => left.className.localeCompare(right.className))
			.map((schema) =>
				immutableRecord({
					className: schema.className,
					fields: snapshotFields(schema.fields, schema, [], context),
				}),
			),
	)
	const typegenGraph = snapshotTypegenGraph(application.typegenGraph)

	return immutableRecord({
		applicationId,
		...typegenGraph,
		fieldMethods,
		schemas,
		version: 6,
	})
}

/** Compiles one application into an inert, deterministic generation snapshot. */
export const createTypegenSnapshot = (
	application: FrameworkApplication<
		readonly SchemaDefinition[],
		readonly PluginDefinition[]
	>,
	applicationId: string,
): TypegenApplicationSnapshot => {
	application.compileSchemas()

	return createCompiledTypegenSnapshot(
		{
			fieldBuilderMethods: application.fieldBuilderMethods,
			pluginFieldTypes: application.pluginFieldTypes,
			schemas: application.schemas,
			typegenGraph: application.typegenGraph,
		},
		applicationId,
	)
}

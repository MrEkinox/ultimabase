import type {
	CompiledApplication,
	CompiledSchemaRegistry,
	FieldDeclarationContext,
	FieldTypegenState,
	JsonValue,
	OwnedFieldBuilderMethod,
	OwnedPluginFieldType,
	SchemaDefinition,
	UltimaBase,
} from '@ultimabase/core'
import type {
	CompiledTypegenGraph,
	PluginDefinition,
} from '@ultimabase/core/plugin'
import { immutableArray, immutableRecord } from '@ultimabase/shared'

import {
	createPluginValueReferences,
	snapshotFields,
	snapshotReference,
	type FieldSnapshotContext,
} from './snapshot/fields.js'
import { snapshotTypegenGraph } from './snapshot/plugin-graph.js'
import { snapshotVirtualFields } from './snapshot/virtual-fields.js'

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
	readonly outputOnly?: true
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
	readonly virtualFields: readonly TypegenVirtualFieldSnapshot[]
}

export interface TypegenVirtualFieldSnapshot extends TypegenFieldSnapshot {
	readonly select: readonly string[]
}

export interface TypegenFieldMethodSnapshot {
	readonly context: FieldDeclarationContext
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
	readonly compatibility?: TypegenReference
	readonly contributionId: string
	readonly contexts?: readonly FieldDeclarationContext[]
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
	readonly target: 'application'
	readonly transaction: 'forbidden' | 'optional' | 'required'
	readonly version: string
}

/** Carries one callback-free direct schema-mutation surface declaration. */
export interface TypegenSchemaMutationSnapshot {
	readonly authority: 'master' | 'request'
	readonly contributionId: string
	readonly effect: 'delete' | 'update'
	readonly errors: readonly string[]
	readonly input: TypegenReference | undefined
	readonly mutation: string
	readonly name: string
	readonly owner: TypegenOwnerSnapshot
	readonly returning: 'after' | 'before'
	readonly select: readonly string[]
	readonly staticOptions: Readonly<Record<string, JsonValue>>
	readonly version: string
}

export interface TypegenSchemaSurfaceSnapshot {
	readonly className: string
	readonly schemaMutations: readonly TypegenSchemaMutationSnapshot[]
}

export interface TypegenApplicationSnapshot {
	readonly applicationId: string
	readonly fieldMethods: readonly TypegenFieldMethodSnapshot[]
	readonly operations: readonly TypegenOperationSnapshot[]
	readonly options: readonly TypegenOptionSnapshot[]
	/** Changes fingerprints for private storage without revealing its descriptors. */
	readonly privateStorageFingerprint?: string
	readonly schemas: readonly TypegenSchemaSnapshot[]
	readonly surfaces: readonly TypegenSchemaSurfaceSnapshot[]
	readonly version: 11
}

export interface CompiledTypegenApplication {
	readonly fieldBuilderMethods: readonly OwnedFieldBuilderMethod[]
	readonly pluginFieldTypes: readonly OwnedPluginFieldType[]
	readonly schemas: CompiledSchemaRegistry
	readonly privateStorageFingerprint?: string
	readonly typegenGraph?: CompiledTypegenGraph
}

const fieldContexts = ['stored', 'embedded', 'virtual', 'output'] as const

const snapshotFieldMethods = (
	methods: readonly OwnedFieldBuilderMethod[],
): readonly TypegenFieldMethodSnapshot[] =>
	immutableArray(
		[...methods]
			.sort((left, right) => left.name.localeCompare(right.name))
			.flatMap((method) =>
				fieldContexts.flatMap((context) => {
					const implementation = method.contexts[context]

					if (implementation === undefined) return []

					const { methodType, module, structuralContainsType, valueType } =
						implementation.typegen

					return [
						immutableRecord({
							context,
							fieldKind: implementation.fieldKind,
							method: snapshotReference(methodType, module),
							name: method.name,
							owner: method.owner,
							structuralContains:
								structuralContainsType === undefined
									? undefined
									: snapshotReference(structuralContainsType, module),
							value: snapshotReference(valueType, module),
						}),
					]
				}),
			),
	)

/** Converts an already compiled application graph into an inert snapshot. */
export const createCompiledTypegenSnapshot = (
	application: CompiledTypegenApplication,
	applicationId: string,
): TypegenApplicationSnapshot => {
	if (applicationId.trim() === '') {
		throw new TypeError('applicationId must be a non-empty string')
	}

	const context: FieldSnapshotContext = {
		pluginValues: createPluginValueReferences(application.pluginFieldTypes),
		schemas: application.schemas,
	}
	const fieldMethods = snapshotFieldMethods(application.fieldBuilderMethods)
	const schemas = immutableArray(
		[...application.schemas.values()]
			.sort((left, right) => left.className.localeCompare(right.className))
			.map((schema) =>
				immutableRecord({
					className: schema.className,
					fields: snapshotFields(schema.persistedFields, schema, [], context),
					virtualFields: snapshotVirtualFields(
						schema.virtualFields,
						schema,
						context,
					),
				}),
			),
	)
	const { privateStorageFingerprint } = application

	// Key order is part of the fingerprint: the graph projection precedes the
	// field methods exactly as in every previously generated declaration.
	return immutableRecord({
		applicationId,
		...snapshotTypegenGraph(application.typegenGraph),
		fieldMethods,
		...(privateStorageFingerprint === undefined
			? {}
			: { privateStorageFingerprint }),
		schemas,
		version: 11,
	})
}

/** Compiles one application into an inert, deterministic generation snapshot. */
export const createTypegenSnapshot = (
	ultimabase: Pick<
		UltimaBase<readonly SchemaDefinition[], readonly PluginDefinition[]>,
		'compile'
	>,
	applicationId: string,
): TypegenApplicationSnapshot => {
	const application: CompiledApplication = ultimabase.compile()

	return createCompiledTypegenSnapshot(application, applicationId)
}

import {
	assertNonEmptyString,
	immutableArray,
	immutableRecord,
	isPlainRecord,
} from '@ultimabase/shared'
import { valid } from 'semver'

import type { QueryBuilder } from '../query/query/query.js'
import { Schema, type SchemaDefinition } from '../schema/schema/definition.js'
import type { PluginSchemaContributionOwner } from '../schema/schema/provenance.js'
import type { JsonValue } from '../schema/fields/builtins/json.js'
import type {
	PluginOperationDefinition,
	PluginOperationValueContract,
} from './plugin-operations.js'
import { isPluginOperationDefinition } from './plugin-operations.js'
import type {
	SchemaSelection,
	SchemaSelectorOptions,
} from './schema-patch-contracts.js'
import { snapshotStaticOptions } from './schema-declaration-contracts.js'

/** Defines one immutable QueryBuilder extension contributed to schema handles. */
export interface DefineQueryExtensionOptions<
	TName extends string,
	TVersion extends string,
	TInput,
> {
	/** Stable namespaced extension identity. */
	readonly name: TName
	/** Exact semantic protocol version. */
	readonly version: TVersion
	/** Validates and detaches each dynamic JavaScript input. */
	readonly input: PluginOperationValueContract<TInput>
	/** Produces an immutable ordinary query without intercepting Runtime. */
	apply(schema: SchemaDefinition, input: TInput): QueryBuilder<SchemaDefinition>
}

declare const queryExtensionDefinitionType: unique symbol

/** Carries one query-authoring extension without Runtime middleware authority. */
export interface QueryExtensionDefinition<
	TName extends string = string,
	TVersion extends string = string,
	TInput = unknown,
> extends DefineQueryExtensionOptions<TName, TVersion, TInput> {
	readonly [queryExtensionDefinitionType]?: TInput
	readonly kind: 'query-extension'
}

/** Reads one query extension's exact input type. */
export type QueryExtensionInput<TExtension> =
	TExtension extends QueryExtensionDefinition<string, string, infer TInput>
		? TInput
		: never

const queryExtensions = new WeakSet<object>()
const namespacedNamePattern =
	/^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?\.[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/u

/** Defines one ordinary QueryBuilder authoring extension. */
export const defineQueryExtension = <
	const TName extends string,
	const TVersion extends string,
	TInput,
>(
	options: DefineQueryExtensionOptions<TName, TVersion, TInput>,
): QueryExtensionDefinition<TName, TVersion, TInput> => {
	const untrustedOptions: unknown = options
	if (!isPlainRecord(untrustedOptions)) {
		throw new TypeError('query extension must be a plain object')
	}
	for (const key of Object.keys(untrustedOptions)) {
		if (
			key !== 'apply' &&
			key !== 'input' &&
			key !== 'name' &&
			key !== 'version'
		) {
			throw new TypeError(`query extension contains unknown option: ${key}`)
		}
	}
	assertNonEmptyString(options.name, 'query extension name')
	if (!namespacedNamePattern.test(options.name)) {
		throw new TypeError(
			`query extension name must be namespaced: ${options.name}`,
		)
	}
	if (valid(options.version) !== options.version) {
		throw new TypeError(
			`query extension version must be exact SemVer: ${options.version}`,
		)
	}
	if (
		!isPlainRecord(options.input) ||
		typeof options.input.snapshot !== 'function'
	) {
		throw new TypeError('query extension input must expose a snapshot function')
	}
	if (typeof options.apply !== 'function') {
		throw new TypeError('query extension apply must be a function')
	}

	const definition = immutableRecord({
		apply: (schema: SchemaDefinition, input: TInput) =>
			options.apply(schema, input),
		input: options.input,
		kind: 'query-extension' as const,
		name: options.name,
		version: options.version,
	}) as QueryExtensionDefinition<TName, TVersion, TInput>
	queryExtensions.add(definition)
	return definition
}

export interface PluginOperationDeclarationRegistrar {
	/** Declares one operation token without installing a handler or transport. */
	declare(operation: PluginOperationDefinition): void
}

export interface PluginModelSurfaceRegistrar {
	/** Adds schema- and model-bound operation aliases to selected handles. */
	extend(
		target: SchemaDefinition | SchemaSelectorOptions,
		options: {
			readonly contributionId: string
			readonly modelCommands?: Readonly<
				Record<string, PluginOperationDefinition<string, string, 'model'>>
			>
			readonly schemaCommands?: Readonly<
				Record<string, PluginOperationDefinition<string, string, 'schema'>>
			>
			readonly staticOptions?: Readonly<Record<string, JsonValue>>
		},
	): void
}

export interface PluginQuerySurfaceRegistrar {
	/** Adds ordinary QueryBuilder factories to selected application schema handles. */
	extend(
		target: SchemaDefinition | SchemaSelectorOptions,
		options: {
			readonly contributionId: string
			readonly extensions: Readonly<Record<string, QueryExtensionDefinition>>
			readonly staticOptions?: Readonly<Record<string, JsonValue>>
		},
	): void
}

export interface OwnedPluginOperationDeclaration {
	readonly operation: PluginOperationDefinition
	readonly owner: PluginSchemaContributionOwner
}

export interface OwnedModelSurfaceDeclaration {
	readonly contributionId: string
	readonly modelCommands: Readonly<
		Record<string, PluginOperationDefinition<string, string, 'model'>>
	>
	readonly owner: PluginSchemaContributionOwner
	readonly schemaCommands: Readonly<
		Record<string, PluginOperationDefinition<string, string, 'schema'>>
	>
	readonly staticOptions: Readonly<Record<string, JsonValue>>
	readonly target: ApplicationSurfaceTarget
}

export interface OwnedQuerySurfaceDeclaration {
	readonly contributionId: string
	readonly extensions: Readonly<Record<string, QueryExtensionDefinition>>
	readonly owner: PluginSchemaContributionOwner
	readonly staticOptions: Readonly<Record<string, JsonValue>>
	readonly target: ApplicationSurfaceTarget
}

/** Distinguishes exact owned schema identity from an ordered frozen selector. */
export type ApplicationSurfaceTarget =
	| Readonly<{ readonly kind: 'schema'; readonly schema: SchemaDefinition }>
	| Readonly<{
			readonly kind: 'selection'
			readonly selection: SchemaSelection
	  }>

export interface MutableApplicationSurfaceDeclarations {
	readonly modelSurfaces: OwnedModelSurfaceDeclaration[]
	readonly operations: OwnedPluginOperationDeclaration[]
	readonly querySurfaces: OwnedQuerySurfaceDeclaration[]
}

export interface ApplicationSurfaceDeclarations {
	readonly modelSurfaces: readonly OwnedModelSurfaceDeclaration[]
	readonly operations: readonly OwnedPluginOperationDeclaration[]
	readonly querySurfaces: readonly OwnedQuerySurfaceDeclaration[]
}

const snapshotCommandMap = <TTarget extends 'model' | 'schema'>(
	value:
		| Readonly<
				Record<string, PluginOperationDefinition<string, string, TTarget>>
		  >
		| undefined,
	target: TTarget,
	path: string,
): Readonly<
	Record<string, PluginOperationDefinition<string, string, TTarget>>
> => {
	if (value === undefined) return immutableRecord({})
	if (!isPlainRecord(value))
		throw new TypeError(`${path} must be a plain object`)
	for (const [name, operation] of Object.entries(value)) {
		assertNonEmptyString(name, `${path} command name`)
		if (
			!isPluginOperationDefinition(operation) ||
			operation.target !== target
		) {
			throw new TypeError(
				`${path}.${name} must reference a ${target} operation`,
			)
		}
	}
	return immutableRecord(value)
}

/** Creates privilege-scoped registrars over one still-transactional plugin batch. */
export const createApplicationSurfaceRegistrars = (
	owner: PluginSchemaContributionOwner,
	declarations: MutableApplicationSurfaceDeclarations,
	createSelection: (selector: SchemaSelectorOptions) => SchemaSelection,
): Readonly<{
	models: PluginModelSurfaceRegistrar
	operations: PluginOperationDeclarationRegistrar
	queries: PluginQuerySurfaceRegistrar
}> => {
	const createTarget = (
		target: SchemaDefinition | SchemaSelectorOptions,
	): ApplicationSurfaceTarget =>
		Schema.is(target)
			? immutableRecord({ kind: 'schema' as const, schema: target })
			: immutableRecord({
					kind: 'selection' as const,
					selection: createSelection(target),
				})

	return immutableRecord({
		models: immutableRecord({
			extend: (target, options): void => {
				if (!isPlainRecord(options)) {
					throw new TypeError('model surface must be a plain object')
				}
				assertNonEmptyString(
					options.contributionId,
					'model surface contributionId',
				)
				const modelCommands = snapshotCommandMap(
					options.modelCommands,
					'model',
					'model surface',
				)
				const schemaCommands = snapshotCommandMap(
					options.schemaCommands,
					'schema',
					'model surface',
				)
				if (
					Object.keys(modelCommands).length === 0 &&
					Object.keys(schemaCommands).length === 0
				) {
					throw new TypeError('model surface must declare at least one command')
				}
				declarations.modelSurfaces.push(
					immutableRecord({
						contributionId: options.contributionId,
						modelCommands,
						owner,
						schemaCommands,
						staticOptions: snapshotStaticOptions(
							options.staticOptions,
							'model surface staticOptions',
						),
						target: createTarget(target),
					}),
				)
			},
		}),
		operations: immutableRecord({
			declare: (operation): void => {
				if (!isPluginOperationDefinition(operation)) {
					throw new TypeError('operation must be created by defineOperation')
				}
				declarations.operations.push(immutableRecord({ operation, owner }))
			},
		}),
		queries: immutableRecord({
			extend: (target, options): void => {
				if (!isPlainRecord(options)) {
					throw new TypeError('query surface must be a plain object')
				}
				assertNonEmptyString(
					options.contributionId,
					'query surface contributionId',
				)
				if (!isPlainRecord(options.extensions)) {
					throw new TypeError('query surface extensions must be a plain object')
				}
				for (const [name, extension] of Object.entries(options.extensions)) {
					assertNonEmptyString(name, 'query surface extension name')
					if (!queryExtensions.has(extension)) {
						throw new TypeError(
							`query surface ${name} must be created by defineQueryExtension`,
						)
					}
				}
				if (Object.keys(options.extensions).length === 0) {
					throw new TypeError(
						'query surface must declare at least one extension',
					)
				}
				declarations.querySurfaces.push(
					immutableRecord({
						contributionId: options.contributionId,
						extensions: immutableRecord(options.extensions),
						owner,
						staticOptions: snapshotStaticOptions(
							options.staticOptions,
							'query surface staticOptions',
						),
						target: createTarget(target),
					}),
				)
			},
		}),
	})
}

export const snapshotApplicationSurfaceDeclarations = (
	declarations: MutableApplicationSurfaceDeclarations,
): ApplicationSurfaceDeclarations =>
	immutableRecord({
		modelSurfaces: immutableArray(declarations.modelSurfaces),
		operations: immutableArray(declarations.operations),
		querySurfaces: immutableArray(declarations.querySurfaces),
	})

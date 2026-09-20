import { immutableRecord, isPlainRecord } from '@ultimabase/shared'

import {
	assertOperationIdentity,
	assertOperationValueContract,
	snapshotOperationErrors,
} from './operation-contract-validation.js'
import type { PluginOperationValueContract } from './plugin-operations.js'
import type { TypegenReference } from './typegen-contracts.js'

/** Selects which request authority may enter one schema mutation. */
export type PluginSchemaMutationAuthority = 'request' | 'master'

/** Selects the only physical effect families supported by protocol 1. */
export type PluginSchemaMutationEffect = 'update' | 'delete'

/** Selects which logical record is materialized as the public result. */
export type PluginSchemaMutationReturning = 'before' | 'after'

/** Reuses one public Typegen reference for mutations with no custom payload. */
export type PluginSchemaMutationNoInput = undefined

/** Names flat persisted values privately loaded for the owner effect resolver. */
export type PluginSchemaMutationDependencySelection = Readonly<
	Record<string, true>
>

/** Defines one item-oriented plugin mutation without an executable handler. */
export interface DefinePluginSchemaMutationOptions<
	TName extends string,
	TVersion extends string,
	TInput,
	TErrors extends readonly string[] = readonly [],
	TAuthority extends PluginSchemaMutationAuthority =
		PluginSchemaMutationAuthority,
	TEffect extends PluginSchemaMutationEffect = PluginSchemaMutationEffect,
	TReturning extends PluginSchemaMutationReturning =
		PluginSchemaMutationReturning,
	TSelect extends PluginSchemaMutationDependencySelection =
		PluginSchemaMutationDependencySelection,
> {
	/** Accepts the caller's authority or requires an already trusted Master request. */
	readonly authority: TAuthority
	/** Selects an owner-only update or a Master-only physical delete. */
	readonly effect: TEffect
	/** Declares the complete public PluginError vocabulary. */
	readonly errors?: TErrors
	/** Validates only the operation-specific payload. */
	readonly input: PluginOperationValueContract<TInput>
	/** Stable namespaced operation identity. @example `"community.workflow.archive"` */
	readonly name: TName
	/** Fixes which logical record is returned across every entry path. */
	readonly returning: TReturning
	/** Declares flat persisted dependencies privately loaded for the resolver. */
	readonly select?: TSelect
	/** Exact semantic protocol version. @example `"1.0.0"` */
	readonly version: TVersion
}

declare const pluginSchemaMutationDefinitionType: unique symbol

/** Carries one immutable source token while retaining its private input snapshot. */
export interface PluginSchemaMutationDefinition<
	TName extends string = string,
	TVersion extends string = string,
	TInput = unknown,
	TErrors extends readonly string[] = readonly string[],
	TAuthority extends PluginSchemaMutationAuthority =
		PluginSchemaMutationAuthority,
	TEffect extends PluginSchemaMutationEffect = PluginSchemaMutationEffect,
	TReturning extends PluginSchemaMutationReturning =
		PluginSchemaMutationReturning,
	TSelect extends PluginSchemaMutationDependencySelection =
		PluginSchemaMutationDependencySelection,
> extends DefinePluginSchemaMutationOptions<
	TName,
	TVersion,
	TInput,
	TErrors,
	TAuthority,
	TEffect,
	TReturning,
	TSelect
> {
	readonly errors: TErrors
	readonly kind: 'plugin-schema-mutation'
	readonly select: TSelect
	readonly [pluginSchemaMutationDefinitionType]?: Readonly<{
		readonly errors: TErrors[number]
		readonly input: TInput
	}>
}

/** Carries the callback-free facts safe for compilation and Typegen. */
export interface CompiledPluginSchemaMutationDefinition<
	TName extends string = string,
	TVersion extends string = string,
	TErrors extends readonly string[] = readonly string[],
> {
	readonly authority: PluginSchemaMutationAuthority
	readonly effect: PluginSchemaMutationEffect
	readonly errors: TErrors
	readonly input: Readonly<{ readonly typegen?: TypegenReference }>
	readonly kind: 'plugin-schema-mutation'
	readonly name: TName
	readonly returning: PluginSchemaMutationReturning
	readonly select: PluginSchemaMutationDependencySelection
	readonly version: TVersion
}

/** Reads one mutation token's exact operation-specific payload. */
export type PluginSchemaMutationInput<TMutation> =
	TMutation extends PluginSchemaMutationDefinition<string, string, infer TInput>
		? TInput
		: never

/** Reads one mutation token's declared public plugin-error codes. */
export type PluginSchemaMutationErrorCode<TMutation> =
	TMutation extends PluginSchemaMutationDefinition<
		string,
		string,
		unknown,
		infer TErrors
	>
		? TErrors[number]
		: never

const schemaMutationDefinitions = new WeakSet<object>()

const snapshotSelection = (
	value: PluginSchemaMutationDependencySelection | undefined,
): PluginSchemaMutationDependencySelection => {
	if (value === undefined) return immutableRecord({})
	if (!isPlainRecord(value)) {
		throw new TypeError('schema mutation select must be a plain object')
	}
	const untrustedSelection: Readonly<Record<string, unknown>> = value
	for (const [name, selected] of Object.entries(untrustedSelection)) {
		if (name.trim() === '') {
			throw new TypeError('schema mutation select field must be non-empty')
		}
		if (selected !== true) {
			throw new TypeError(`schema mutation select.${name} must be true`)
		}
	}
	return immutableRecord(value)
}

/** Creates one stable mutation token; execution is contributed separately. */
export const defineSchemaMutation = <
	const TName extends string,
	const TVersion extends string,
	TInput,
	const TErrors extends readonly string[] = readonly [],
	const TAuthority extends PluginSchemaMutationAuthority =
		PluginSchemaMutationAuthority,
	const TEffect extends PluginSchemaMutationEffect = PluginSchemaMutationEffect,
	const TReturning extends PluginSchemaMutationReturning =
		PluginSchemaMutationReturning,
	const TSelect extends PluginSchemaMutationDependencySelection =
		PluginSchemaMutationDependencySelection,
>(
	options: DefinePluginSchemaMutationOptions<
		TName,
		TVersion,
		TInput,
		TErrors,
		TAuthority,
		TEffect,
		TReturning,
		TSelect
	>,
): PluginSchemaMutationDefinition<
	TName,
	TVersion,
	TInput,
	TErrors,
	TAuthority,
	TEffect,
	TReturning,
	TSelect
> => {
	const untrusted: unknown = options
	if (!isPlainRecord(untrusted)) {
		throw new TypeError('schema mutation definition must be a plain object')
	}
	for (const key of Object.keys(untrusted)) {
		if (
			key !== 'authority' &&
			key !== 'effect' &&
			key !== 'errors' &&
			key !== 'input' &&
			key !== 'name' &&
			key !== 'returning' &&
			key !== 'select' &&
			key !== 'version'
		) {
			throw new TypeError(
				`schema mutation definition contains unknown option: ${key}`,
			)
		}
	}

	assertOperationIdentity(options.name, options.version, 'schema mutation')
	assertOperationValueContract(options.input, 'schema mutation input')
	if (options.authority !== 'request' && options.authority !== 'master') {
		throw new TypeError('schema mutation authority must be request or master')
	}
	if (options.effect !== 'update' && options.effect !== 'delete') {
		throw new TypeError('schema mutation effect must be update or delete')
	}
	if (options.returning !== 'before' && options.returning !== 'after') {
		throw new TypeError('schema mutation returning must be before or after')
	}
	if (options.effect === 'delete' && options.authority !== 'master') {
		throw new TypeError('delete schema mutations must require master authority')
	}
	if (options.effect === 'delete' && options.returning !== 'before') {
		throw new TypeError('delete schema mutations must return the before record')
	}

	const definition = immutableRecord({
		authority: options.authority,
		effect: options.effect,
		errors: snapshotOperationErrors(options.errors, 'schema mutation'),
		input: options.input,
		kind: 'plugin-schema-mutation' as const,
		name: options.name,
		returning: options.returning,
		select: snapshotSelection(options.select),
		version: options.version,
	}) as PluginSchemaMutationDefinition<
		TName,
		TVersion,
		TInput,
		TErrors,
		TAuthority,
		TEffect,
		TReturning,
		TSelect
	>
	schemaMutationDefinitions.add(definition)
	return definition
}

/** Narrows unknown input to a token created by `defineSchemaMutation`. */
export const isPluginSchemaMutationDefinition = (
	value: unknown,
): value is PluginSchemaMutationDefinition =>
	typeof value === 'object' &&
	value !== null &&
	schemaMutationDefinitions.has(value)

/** @internal Projects one callback-free application compilation descriptor. */
export const compilePluginSchemaMutationDefinition = (
	definition: PluginSchemaMutationDefinition,
): CompiledPluginSchemaMutationDefinition => {
	return immutableRecord({
		authority: definition.authority,
		effect: definition.effect,
		errors: definition.errors,
		input: immutableRecord({
			...(definition.input.typegen === undefined
				? {}
				: { typegen: definition.input.typegen }),
		}),
		kind: definition.kind,
		name: definition.name,
		returning: definition.returning,
		select: definition.select,
		version: definition.version,
	})
}

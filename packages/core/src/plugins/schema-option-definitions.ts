import { immutableRecord } from '@ultimabase/shared'

import { assertExactPlainObject } from '../exact-object-validation.js'

import type {
	CapabilityConsumerValue,
	CapabilityRequirement,
	CapabilityToken,
} from './capabilities.js'

import { assertCapabilityRequirement } from './capabilities.js'

import { type SchemaOptionProvenance } from '../schema/schema/provenance.js'
import {
	normalizeFieldDeclarationContexts,
	type FieldDeclarationContext,
} from '../schema/schema/field-contexts.js'

declare const fieldOptionSourceType: unique symbol

type RequirementConsumerValue<TRequirement> =
	TRequirement extends CapabilityRequirement<infer TToken, infer TOptional>
		? TOptional extends true
			? CapabilityConsumerValue<TToken> | undefined
			: CapabilityConsumerValue<TToken>
		: never

export type SchemaOptionRuntimeRequirement = CapabilityRequirement<
	CapabilityToken,
	boolean,
	string,
	'materialization'
>

export interface SchemaOptionRuntimeCompilationContext<
	TValue = unknown,
	TRequirement extends SchemaOptionRuntimeRequirement =
		SchemaOptionRuntimeRequirement,
> {
	/** Reads the exact application capability declared by the option owner. */
	readonly capability: RequirementConsumerValue<TRequirement>
	/** Identifies the final application-local schema occurrence. */
	readonly className: string
	/** Identifies the field for field-scoped options only. */
	readonly fieldName?: string
	/** Identifies the exact semantic field location for field-scoped options only. */
	readonly fieldContext?: FieldDeclarationContext
	/** Names the direct schema or field option. */
	readonly optionName: string
	/** Gives diagnostics one stable path into the final logical graph. */
	readonly path: string
	/** Explains both the option contract owner and the final value contributor. */
	readonly provenance: SchemaOptionProvenance
	/** Distinguishes direct schema options from direct field options. */
	readonly scope: 'field' | 'schema'
	/** Carries the normalized immutable option snapshot. */
	readonly value: TValue
}

type SchemaOptionRuntimeCompile<
	TValue,
	TRequirement extends SchemaOptionRuntimeRequirement,
> = {
	bivarianceHack(
		context: SchemaOptionRuntimeCompilationContext<TValue, TRequirement>,
	): undefined
}['bivarianceHack']

export interface SchemaOptionRuntimeCompiler<
	TValue = unknown,
	TRequirement extends SchemaOptionRuntimeRequirement =
		SchemaOptionRuntimeRequirement,
> {
	readonly requirement: TRequirement
	readonly compile: SchemaOptionRuntimeCompile<TValue, TRequirement>
}

export interface SchemaOptionDefinition<
	TValue = unknown,
	TRequirement extends SchemaOptionRuntimeRequirement =
		SchemaOptionRuntimeRequirement,
> {
	readonly normalize: (value: unknown, path: string) => TValue
	readonly protocolVersion: number
	readonly runtime?: SchemaOptionRuntimeCompiler<TValue, TRequirement>
	/** Keeps executable or nominal option values application-local; selectors only compare portable values. */
	readonly valueKind?: 'json' | 'opaque'
}

/** Defines one direct field option and every semantic context it can execute. */
export interface FieldOptionDefinition<
	TValue = unknown,
	TRequirement extends SchemaOptionRuntimeRequirement =
		SchemaOptionRuntimeRequirement,
	TSource = TValue,
> extends SchemaOptionDefinition<TValue, TRequirement> {
	readonly contexts: readonly FieldDeclarationContext[]
	/** @internal Retains the source-authoring value without emitting Runtime data. */
	readonly [fieldOptionSourceType]?: TSource
}

export const schemaOptionDefinitions: WeakSet<object> = new WeakSet<object>()
export const fieldOptionDefinitions: WeakSet<object> = new WeakSet<object>()

const optionDefinitionKeys = new Set([
	'normalize',
	'protocolVersion',
	'runtime',
	'valueKind',
])
const fieldOptionDefinitionKeys = new Set([...optionDefinitionKeys, 'contexts'])

const optionRuntimeKeys = new Set(['compile', 'requirement'])

const isSchemaOptionRuntimeCompile = (
	value: unknown,
): value is (context: unknown) => unknown => typeof value === 'function'

const normalizeOptionDefinition = <
	const TValue,
	const TRequirement extends SchemaOptionRuntimeRequirement =
		SchemaOptionRuntimeRequirement,
	TSource = TValue,
>(
	definition:
		| SchemaOptionDefinition<TValue, TRequirement>
		| FieldOptionDefinition<TValue, TRequirement, TSource>,
	field: boolean,
):
	| SchemaOptionDefinition<TValue, TRequirement>
	| FieldOptionDefinition<TValue, TRequirement, TSource> => {
	assertExactPlainObject(
		definition,
		field ? fieldOptionDefinitionKeys : optionDefinitionKeys,
		'Schema option definition must be a plain object',
		`Unknown ${field ? 'field option definition' : 'schema option definition'} key: `,
	)

	if (
		!Number.isSafeInteger(definition.protocolVersion) ||
		definition.protocolVersion < 1
	) {
		throw new RangeError(
			'Schema option protocolVersion must be a positive safe integer',
		)
	}

	if (typeof definition.normalize !== 'function') {
		throw new TypeError('Schema option normalize must be a function')
	}

	const valueKind: unknown = definition.valueKind
	if (
		valueKind !== undefined &&
		valueKind !== 'json' &&
		valueKind !== 'opaque'
	) {
		throw new TypeError('Schema option valueKind must be json or opaque')
	}

	const runtime = definition.runtime
	let runtimeCompile: ((context: unknown) => unknown) | undefined
	if (runtime !== undefined) {
		assertExactPlainObject(
			runtime,
			optionRuntimeKeys,
			'Schema option runtime must be a plain object',
			'Unknown schema option runtime key: ',
		)
		const untrustedCompile: unknown = runtime.compile
		if (!isSchemaOptionRuntimeCompile(untrustedCompile)) {
			throw new TypeError('Schema option runtime.compile must be a function')
		}
		runtimeCompile = untrustedCompile
		const untrustedRequirement: unknown = runtime.requirement
		assertCapabilityRequirement(
			untrustedRequirement,
			'Schema option runtime.requirement',
		)
		if (untrustedRequirement.token.lifetime !== 'application') {
			throw new TypeError(
				'Schema option runtime.requirement must target an application capability',
			)
		}
		if (untrustedRequirement.phase !== 'materialization') {
			throw new TypeError(
				'Schema option runtime.requirement must use the materialization phase',
			)
		}
	}

	const contexts = field
		? normalizeFieldDeclarationContexts(
				Reflect.get(definition, 'contexts'),
				'Field option contexts',
			)
		: undefined
	const normalized = immutableRecord({
		...(contexts === undefined ? {} : { contexts }),
		normalize: definition.normalize,
		protocolVersion: definition.protocolVersion,
		...(runtime === undefined || runtimeCompile === undefined
			? {}
			: {
					runtime: immutableRecord({
						compile: (
							context: SchemaOptionRuntimeCompilationContext,
						): undefined => {
							const contextSnapshot = immutableRecord({
								...context,
								capability:
									context.capability as RequirementConsumerValue<TRequirement>,
								value: context.value as TValue,
							})
							const result = runtimeCompile(contextSnapshot)
							if (result !== undefined) {
								throw new TypeError(
									'Schema option Runtime compiler must return undefined',
								)
							}
							return undefined
						},
						requirement: runtime.requirement,
					}),
				}),
		valueKind: valueKind ?? 'json',
	})

	schemaOptionDefinitions.add(normalized)
	if (field) fieldOptionDefinitions.add(normalized)

	return normalized
}

/** Defines one schema-scoped option without field-context semantics. */
export const defineSchemaOption = <
	const TValue,
	const TRequirement extends SchemaOptionRuntimeRequirement =
		SchemaOptionRuntimeRequirement,
>(
	definition: SchemaOptionDefinition<TValue, TRequirement>,
): SchemaOptionDefinition<TValue, TRequirement> =>
	normalizeOptionDefinition(definition, false)

/** Defines one field-scoped option with an explicit non-empty context set. */
export const defineFieldOption = <
	const TValue,
	const TRequirement extends SchemaOptionRuntimeRequirement =
		SchemaOptionRuntimeRequirement,
	TSource = TValue,
>(
	definition: FieldOptionDefinition<TValue, TRequirement, TSource>,
): FieldOptionDefinition<TValue, TRequirement, TSource> =>
	normalizeOptionDefinition(definition, true) as FieldOptionDefinition<
		TValue,
		TRequirement,
		TSource
	>

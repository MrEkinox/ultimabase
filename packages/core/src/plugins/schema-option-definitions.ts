import {
	assertNonEmptyString,
	immutableRecord,
	isPlainRecord,
} from '@ultimabase/shared'

import type { JsonValue } from '../schema/fields/builtins/json.js'

import type {
	CapabilityConsumerValue,
	CapabilityRequirement,
	CapabilityToken,
} from './capabilities.js'

import { assertCapabilityRequirement } from './capabilities.js'

import { type SchemaOptionProvenance } from '../schema/schema/provenance.js'

export interface SchemaOptionTypegenDescriptor {
	readonly module: string
	readonly type: string
}

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
	TValue extends JsonValue,
	TRequirement extends SchemaOptionRuntimeRequirement =
		SchemaOptionRuntimeRequirement,
> {
	/** Reads the exact application capability declared by the option owner. */
	readonly capability: RequirementConsumerValue<TRequirement>
	/** Identifies the final application-local schema occurrence. */
	readonly className: string
	/** Identifies the field for field-scoped options only. */
	readonly fieldName?: string
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

export interface SchemaOptionRuntimeCompiler<
	TValue extends JsonValue = JsonValue,
	TRequirement extends SchemaOptionRuntimeRequirement =
		SchemaOptionRuntimeRequirement,
> {
	readonly requirement: TRequirement
	readonly compile: (
		context: SchemaOptionRuntimeCompilationContext<TValue, TRequirement>,
	) => undefined
}

export interface SchemaOptionDefinition<
	TValue extends JsonValue = JsonValue,
	TRequirement extends SchemaOptionRuntimeRequirement =
		SchemaOptionRuntimeRequirement,
> {
	readonly normalize: (value: unknown, path: string) => TValue
	readonly protocolVersion: number
	readonly runtime?: SchemaOptionRuntimeCompiler<TValue, TRequirement>
	readonly typegen: SchemaOptionTypegenDescriptor
}

export const schemaOptionDefinitions: WeakSet<object> = new WeakSet<object>()

const optionDefinitionKeys = new Set([
	'normalize',
	'protocolVersion',
	'runtime',
	'typegen',
])

const optionTypegenKeys = new Set(['module', 'type'])

const optionRuntimeKeys = new Set(['compile', 'requirement'])

export const assertKnownKeys = (
	value: Readonly<Record<string, unknown>>,
	keys: ReadonlySet<string>,
	path: string,
): void => {
	const unknownKey = Reflect.ownKeys(value).find(
		(key) => typeof key !== 'string' || !keys.has(key),
	)

	if (unknownKey !== undefined) {
		throw new TypeError(`Unknown ${path} key: ${String(unknownKey)}`)
	}
}

const normalizeTypegenDescriptor = (
	value: unknown,
): SchemaOptionTypegenDescriptor => {
	if (!isPlainRecord(value)) {
		throw new TypeError('Schema option typegen must be a plain object')
	}

	assertKnownKeys(value, optionTypegenKeys, 'schema option typegen')
	assertNonEmptyString(value.module, 'Schema option typegen.module')
	assertNonEmptyString(value.type, 'Schema option typegen.type')

	if (value.module.trim() !== value.module || /\s/u.test(value.module)) {
		throw new TypeError(
			'Schema option typegen.module must be a stable module specifier',
		)
	}

	if (!/^[$A-Z_a-z][$\w]*$/u.test(value.type)) {
		throw new TypeError(
			'Schema option typegen.type must be a TypeScript export identifier',
		)
	}

	return immutableRecord({ module: value.module, type: value.type })
}

export const defineSchemaOption = <
	const TValue extends JsonValue,
	const TRequirement extends SchemaOptionRuntimeRequirement =
		SchemaOptionRuntimeRequirement,
>(
	definition: SchemaOptionDefinition<TValue, TRequirement>,
): SchemaOptionDefinition => {
	if (!isPlainRecord(definition)) {
		throw new TypeError('Schema option definition must be a plain object')
	}

	assertKnownKeys(definition, optionDefinitionKeys, 'schema option definition')

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

	const runtime = definition.runtime
	if (runtime !== undefined) {
		if (!isPlainRecord(runtime)) {
			throw new TypeError('Schema option runtime must be a plain object')
		}
		assertKnownKeys(runtime, optionRuntimeKeys, 'schema option runtime')
		if (typeof runtime.compile !== 'function') {
			throw new TypeError('Schema option runtime.compile must be a function')
		}
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

	const normalized: SchemaOptionDefinition = immutableRecord({
		normalize: definition.normalize,
		protocolVersion: definition.protocolVersion,
		...(runtime === undefined
			? {}
			: {
					runtime: immutableRecord({
						compile: (
							context: SchemaOptionRuntimeCompilationContext<JsonValue>,
						): undefined => {
							const contextSnapshot = immutableRecord({
								...context,
								capability:
									context.capability as RequirementConsumerValue<TRequirement>,
								value: context.value as TValue,
							})
							const compile: (input: typeof contextSnapshot) => unknown =
								runtime.compile
							const result = compile(contextSnapshot)
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
		typegen: normalizeTypegenDescriptor(definition.typegen),
	})

	schemaOptionDefinitions.add(normalized)

	return normalized
}

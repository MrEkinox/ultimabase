import {
	assertNonEmptyString,
	immutableRecord,
	isPlainRecord,
} from '@ultimabase/shared'

import { snapshotJsonValue } from '../../schema/fields/builtins/json.js'
import type { JsonValue } from '../../schema/fields/builtins/json.js'
import {
	defineCapability,
	provideCapability,
	replaceCapability,
	type CapabilityContributionTarget,
	type CapabilityProviderDeclaration,
	type CapabilityReplacementDeclaration,
	type CapabilityToken,
} from '../capabilities.js'
import type { PluginIdentity } from '../manifest.js'
import { compileCanonicalSchemaCompilerIr } from './canonical-compiler.js'
import type { SchemaCompilerInput, SchemaCompilerOutput } from './contracts.js'
import { schemaCompilerProtocolVersion } from './contracts.js'

/** Executes one complete synchronous logical schema compilation. */
export type SchemaCompilerImplementation = (
	input: SchemaCompilerInput,
) => SchemaCompilerOutput

/** Carries only inert facts through the declaration capability graph. */
export interface SchemaCompilerProviderDescriptor {
	readonly kind: 'schema-compiler-provider'
	readonly protocolVersion: typeof schemaCompilerProtocolVersion
	readonly staticOptions: Readonly<Record<string, JsonValue>>
}

/** Selects one complete compiler provider rather than a partial transform stage. */
export const schemaCompilerCapability: CapabilityToken<
	SchemaCompilerProviderDescriptor,
	SchemaCompilerProviderDescriptor,
	'ultimabase.schema-compiler',
	'4.0.0',
	'single',
	'declaration'
> = defineCapability<SchemaCompilerProviderDescriptor>()({
	capabilityId: 'ultimabase.schema-compiler',
	version: '4.0.0',
	cardinality: 'single',
	lifetime: 'declaration',
	compose: ([provider]) => provider,
})

/** Identifies the exact compiler provider selected by Core for one application. */
export interface SchemaCompilerProvenance {
	readonly capabilityId: typeof schemaCompilerCapability.capabilityId
	readonly capabilityVersion: typeof schemaCompilerCapability.version
	readonly contributionId: string
	readonly normalizedStaticOptions: Readonly<Record<string, JsonValue>>
	readonly owner:
		| Readonly<{ readonly kind: 'core'; readonly version: string }>
		| Readonly<{
				readonly instanceId?: string
				readonly kind: 'plugin'
				readonly pluginId: string
				readonly version: string
		  }>
	readonly protocolVersion: typeof schemaCompilerProtocolVersion
	readonly target?: CapabilityContributionTarget
}

const canonicalOwner = immutableRecord({ pluginId: '@ultimabase/core' })
const canonicalContributionId = 'canonical-schema-compiler'
const emptyStaticOptions: Readonly<Record<string, JsonValue>> = immutableRecord(
	{},
)

/** Targets the built-in provider explicitly when declaring a first replacement. */
export const canonicalSchemaCompilerTarget: CapabilityContributionTarget =
	immutableRecord({
		contributionId: canonicalContributionId,
		owner: canonicalOwner,
	})

const canonicalProvider = provideCapability(schemaCompilerCapability, {
	contributionId: canonicalContributionId,
	value: immutableRecord({
		kind: 'schema-compiler-provider',
		protocolVersion: schemaCompilerProtocolVersion,
		staticOptions: emptyStaticOptions,
	}),
})

const schemaCompilerImplementations = new WeakMap<
	object,
	SchemaCompilerImplementation
>()
const schemaCompilerReplacements = new WeakSet<object>()

schemaCompilerImplementations.set(
	canonicalProvider,
	compileCanonicalSchemaCompilerIr,
)

/** Supplies the capability inventory with Core's non-plugin canonical provider. */
export const canonicalSchemaCompilerFoundation: Readonly<{
	readonly declaration: CapabilityProviderDeclaration<
		typeof schemaCompilerCapability
	>
	readonly owner: PluginIdentity
	readonly version: string
}> = immutableRecord({
	declaration: canonicalProvider,
	owner: canonicalOwner,
	version: '0.0.0',
})

export interface ReplaceSchemaCompilerOptions {
	/** Pure complete compiler retained privately by Core. */
	readonly compile: SchemaCompilerImplementation
	/** Stable owner-local identity reported in the replacement chain. */
	readonly contributionId: string
	/** Safe deterministic facts included in compiler provenance. */
	readonly staticOptions?: Readonly<Record<string, JsonValue>>
	/** Exact prior provider; defaults to Core's canonical provider. */
	readonly target?: CapabilityContributionTarget
}

const snapshotCompilerStaticOptions = (
	value: Readonly<Record<string, JsonValue>> | undefined,
): Readonly<Record<string, JsonValue>> => {
	if (value === undefined) return emptyStaticOptions
	const snapshot = snapshotJsonValue(value, 'schema compiler staticOptions')
	if (!isPlainRecord(snapshot)) {
		throw new TypeError('schema compiler staticOptions must be a JSON object')
	}
	return snapshot
}

/** Declares one privileged complete compiler replacement with a private callback. */
export const replaceSchemaCompiler = (
	options: ReplaceSchemaCompilerOptions,
): CapabilityReplacementDeclaration<typeof schemaCompilerCapability> => {
	const untrustedOptions: unknown = options
	if (!isPlainRecord(untrustedOptions)) {
		throw new TypeError('schema compiler replacement options must be an object')
	}
	for (const key of Object.keys(untrustedOptions)) {
		if (
			key !== 'compile' &&
			key !== 'contributionId' &&
			key !== 'staticOptions' &&
			key !== 'target'
		) {
			throw new TypeError(
				`schema compiler replacement contains unknown option: ${key}`,
			)
		}
	}
	assertNonEmptyString(options.contributionId, 'contributionId')
	if (typeof options.compile !== 'function') {
		throw new TypeError(
			'schema compiler replacement compile must be a function',
		)
	}
	const staticOptions = snapshotCompilerStaticOptions(options.staticOptions)
	const replacement = replaceCapability(schemaCompilerCapability, {
		contributionId: options.contributionId,
		target: options.target ?? canonicalSchemaCompilerTarget,
		value: {
			kind: 'schema-compiler-provider',
			protocolVersion: schemaCompilerProtocolVersion,
			staticOptions,
		},
	})
	schemaCompilerImplementations.set(replacement, options.compile)
	schemaCompilerReplacements.add(replacement)
	return replacement
}

/** Keeps the exceptional privilege boundary private to Core composition. */
export const isSchemaCompilerReplacement = (
	declaration: CapabilityReplacementDeclaration,
): boolean => schemaCompilerReplacements.has(declaration)

/** Rejects generic capability decoration and replacement of this exact token. */
export const isSchemaCompilerCapability = (token: object): boolean =>
	token === schemaCompilerCapability

/** Resolves only callbacks privately associated with trusted compiler declarations. */
export const readSchemaCompilerImplementation = (
	declaration:
		| CapabilityProviderDeclaration<typeof schemaCompilerCapability>
		| CapabilityReplacementDeclaration<typeof schemaCompilerCapability>,
): SchemaCompilerImplementation => {
	const implementation = schemaCompilerImplementations.get(declaration)
	if (implementation === undefined) {
		throw new TypeError(
			'Schema compiler provider must be created by replaceSchemaCompiler',
		)
	}
	return implementation
}

/** Reads trusted descriptor facts after ordinary capability composition. */
export const readSchemaCompilerDescriptor = (
	declaration:
		| CapabilityProviderDeclaration<typeof schemaCompilerCapability>
		| CapabilityReplacementDeclaration<typeof schemaCompilerCapability>,
): SchemaCompilerProviderDescriptor => {
	if (!('value' in declaration)) {
		throw new TypeError('Schema compiler declaration has no descriptor')
	}
	return declaration.value
}

/** Identifies the exact foundation declaration without trusting a claimed owner. */
export const isCanonicalSchemaCompilerDeclaration = (
	declaration: CapabilityProviderDeclaration | CapabilityReplacementDeclaration,
): boolean => declaration === canonicalProvider

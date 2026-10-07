import {
	definePluginField,
	definePluginFieldFamily,
	definePluginFieldWireProtocol,
	defineSchemaOption,
	type CompiledSchemaRegistry,
	type FieldValueMap,
	type PluginFieldDefinition,
	type PluginFieldFamilyDefinition,
	type PointerValue,
	type PluginSourceOpaque,
	type PluginSourceSchemaFieldValues,
	type RequestSubjectContext,
	type SchemaDefinition,
	type SchemaFieldBuilderDeclaration,
	type SchemaFields,
	type SchemaOptionDefinition,
	type SchemaOptionRuntimeRequirement,
} from '@ultimabase/core'
import {
	immutableRecord,
	isPlainRecord,
	type MaybePromise,
} from '@ultimabase/shared'

import { ACL } from './acl.js'
import {
	snapshotACLContainmentOperand,
	type ACLContainmentOperand,
} from './acl-containment.js'
import { normalizeACLEntryLimits, type ACLEntryLimits } from './acl-limits.js'

/** Identifies the optional plugin that executes ACL behavior. */
export const aclPluginId = '@ultimabase/acl-permissions-plugin' as const

/** Names the logical field injected into every ACL-enabled schema. */
export const aclFieldName = 'acl' as const

/** Identifies the adapter-neutral ACL value field handled by official plugins. */
export const aclFieldKind = 'ultimabase.acl' as const

/** Declares ACL generation types without exposing a schema FieldBuilder method. */
export const aclFieldFamily: PluginFieldFamilyDefinition<typeof aclFieldKind> =
	definePluginFieldFamily({
		fieldKind: aclFieldKind,
		typegen: {
			module: '@ultimabase/acl-permissions-plugin',
			structuralContainsType: 'ACLContainmentOperand',
			valueType: 'ACL',
		},
	})

interface ACLFieldOptions {
	readonly indexed: true
	readonly required: true
}

/** Carries one non-null immutable ACL through ordinary schema inference. */
export type ACLField = PluginFieldDefinition<
	typeof aclFieldKind,
	ACL,
	ACLFieldOptions,
	Readonly<{
		readonly create: 'optional'
		readonly object: 'required'
		readonly update: 'optional'
		readonly nullable: false
		readonly list: false
	}>,
	ACLContainmentOperand
>

const snapshotACL = (value: unknown, path: string): ACL => {
	if (!(value instanceof ACL)) {
		throw new TypeError(`${path} must be an ACL`)
	}

	return value
}

// Public ACL JSON is already versioned and strictly validated in both directions.
const jsonCodec = {
	decode: (value: unknown): ACL => ACL.fromJSON(value),
	encode: (value: ACL): unknown => value.toJSON(),
	format: 'json',
} as const

/** Defines the unchanged adapter-neutral field added to ACL-enabled schemas. */
export const aclField = definePluginField(
	aclFieldKind,
	{ indexed: true, required: true },
	{
		// The ACL plugin supplies missing create values after ordinary fields resolve.
		deferRequiredUntilResolveInput: true,
		snapshotValue: snapshotACL,
		storageCodec: { ...jsonCodec, version: 1 },
		wireCodecs: [
			{
				...jsonCodec,
				protocol: definePluginFieldWireProtocol({
					name: 'ultimabase.rest',
					version: '1.0.0',
				}),
			},
			{
				...jsonCodec,
				protocol: definePluginFieldWireProtocol({
					name: 'ultimabase.graphql.field',
					version: '1.0.0',
				}),
			},
		],
		structuralContains: {
			snapshotOperand: snapshotACLContainmentOperand,
		},
	},
) as ACLField

/** Supplies resolved create data to one schema-local ACL default factory. */
export interface ACLDefaultInput<
	TData extends Readonly<Record<string, unknown>> = Readonly<
		Record<string, unknown>
	>,
> {
	/** Exposes the readonly field-resolved create candidate without the ACL field. */
	readonly data: TData
	/** Exposes the optional principal supplied by a compatible identity provider. */
	readonly principal: PointerValue | undefined
	/** Exposes the active transaction-bound hook context. */
	readonly context: RequestSubjectContext
}

/** Derives one immutable ACL independently for every created object. */
export type ACLDefaultFactory<
	TData extends Readonly<Record<string, unknown>> = Readonly<
		Record<string, unknown>
	>,
> = (input: ACLDefaultInput<TData>) => MaybePromise<ACL>

/** Supplies the shared facts available while resolving create ACL input. */
export interface ACLCreateInputResolution<
	TData extends Readonly<Record<string, unknown>> = Readonly<
		Record<string, unknown>
	>,
> {
	readonly operation: 'create'
	/** Exposes the complete proposed developer-field create candidate. */
	readonly data: TData
	/** Create has no locked persisted preimage. */
	readonly currentData: undefined
	/** Create has no normalized update expression. */
	readonly update: undefined
	readonly inputAcl: ACL | undefined
	readonly currentAcl: undefined
	readonly principal: PointerValue | undefined
	readonly context: RequestSubjectContext
}

/** Describes one immutable normalized update operation supplied to ACL resolution. */
export interface ACLNormalizedUpdateOperation {
	readonly field: string
	readonly kind: 'decrement' | 'increment' | 'set'
	/** Retains the validated operand, including `null` for an explicit clear. */
	readonly value: unknown
}

/** Exposes the normalized non-ACL update intent without adapter-specific syntax. */
export interface ACLNormalizedUpdateInput {
	readonly kind: 'update-expression'
	readonly operations: readonly ACLNormalizedUpdateOperation[]
}

/** Supplies the shared facts available while resolving update ACL input. */
export interface ACLUpdateInputResolution<
	TData extends Readonly<Record<string, unknown>> = Readonly<
		Record<string, unknown>
	>,
> {
	readonly operation: 'update'
	/** Exposes the proposed developer-field row after applying the normalized update. */
	readonly data: TData
	/** Exposes the locked developer-field row before the proposed update. */
	readonly currentData: TData
	/** Exposes the immutable normalized update expression without the ACL operation. */
	readonly update: ACLNormalizedUpdateInput
	readonly inputAcl: ACL | undefined
	readonly currentAcl: ACL
	readonly principal: PointerValue | undefined
	readonly context: RequestSubjectContext
}

/** Lets one callback accept or replace ACL values for both mutation families. */
export type ACLInputResolver<
	TData extends Readonly<Record<string, unknown>> = Readonly<
		Record<string, unknown>
	>,
> = (
	input: ACLCreateInputResolution<TData> | ACLUpdateInputResolution<TData>,
) => MaybePromise<ACL | undefined>

/** Overrides application ACL entry limits for one schema. */
export type ACLSchemaLimits = ACLEntryLimits

type SchemaFieldsForOptions<TOptions> =
	TOptions extends Readonly<{
		readonly fields: SchemaFieldBuilderDeclaration<infer TFields>
	}>
		? TFields
		: SchemaFields

type ACLDataForOptions<TOptions> = FieldValueMap<
	SchemaFieldsForOptions<TOptions>,
	'object'
>

/** Configures ACL generation and accepted input from exact sibling fields. */
export interface ACLSchemaOption<TOptions = unknown> {
	/** Supplies one static ACL or derives it from the field-resolved create candidate. */
	readonly default?: ACL | ACLDefaultFactory<ACLDataForOptions<TOptions>>
	/** Accepts and resolves explicit ACL input for create and update operations. */
	readonly resolveInput?: ACLInputResolver<ACLDataForOptions<TOptions>>
	/**
	 * Overrides either plugin-level limit for this schema only.
	 * Omitted values continue to inherit the corresponding plugin limit.
	 * @example `limits: { maxPrincipals: 25, maxRoles: 10 }`
	 */
	readonly limits?: ACLSchemaLimits
}

type SourceACLData = PluginSourceSchemaFieldValues<typeof aclFieldName>

interface SourceACLDefaultInput {
	readonly context: PluginSourceOpaque<RequestSubjectContext>
	readonly data: SourceACLData
	readonly principal: PluginSourceOpaque<PointerValue | undefined>
}

type SourceACLDefaultFactory = (
	input: SourceACLDefaultInput,
) => MaybePromise<PluginSourceOpaque<ACL>>

interface SourceACLCreateInputResolution {
	readonly context: PluginSourceOpaque<RequestSubjectContext>
	readonly currentAcl: undefined
	readonly currentData: undefined
	readonly data: SourceACLData
	readonly inputAcl: PluginSourceOpaque<ACL | undefined>
	readonly operation: 'create'
	readonly principal: PluginSourceOpaque<PointerValue | undefined>
	readonly update: undefined
}

interface SourceACLUpdateInputResolution {
	readonly context: PluginSourceOpaque<RequestSubjectContext>
	readonly currentAcl: PluginSourceOpaque<ACL>
	readonly currentData: SourceACLData
	readonly data: SourceACLData
	readonly inputAcl: PluginSourceOpaque<ACL | undefined>
	readonly operation: 'update'
	readonly principal: PluginSourceOpaque<PointerValue | undefined>
	readonly update: PluginSourceOpaque<ACLNormalizedUpdateInput>
}

type SourceACLInputResolver = (
	input: SourceACLCreateInputResolution | SourceACLUpdateInputResolution,
) => MaybePromise<PluginSourceOpaque<ACL | undefined>>

interface SourceACLSchemaOption {
	readonly default?: PluginSourceOpaque<ACL> | SourceACLDefaultFactory
	readonly limits?: ACLSchemaLimits
	readonly resolveInput?: SourceACLInputResolver
}

/** Carries one trusted normalized direct ACL option. */
export interface NormalizedACLSchemaOption<
	TData extends Readonly<Record<string, unknown>> = Readonly<
		Record<string, unknown>
	>,
> {
	readonly default: ACL | ACLDefaultFactory<TData>
	readonly resolveInput: ACLInputResolver<TData> | undefined
	readonly limits: Readonly<ACLSchemaLimits> | undefined
}

const aclSchemaOptionKeys = new Set(['default', 'limits', 'resolveInput'])
// Only options produced here are trusted; the map also restores their exact type.
const normalizedOptions = new WeakMap<object, NormalizedACLSchemaOption>()

/** Normalizes direct ACL declarations without executing application callbacks. */
export const normalizeACLSchemaOption = (
	value: unknown,
	path: string,
): NormalizedACLSchemaOption => {
	if (!isPlainRecord(value)) {
		throw new TypeError(`${path} must be a plain object`)
	}
	const unknownKey = Reflect.ownKeys(value).find(
		(key) => typeof key !== 'string' || !aclSchemaOptionKeys.has(key),
	)
	if (unknownKey !== undefined) {
		throw new TypeError(`Unknown ${path} option: ${String(unknownKey)}`)
	}

	const declaredDefault: unknown = value.default
	if (
		declaredDefault !== undefined &&
		!(declaredDefault instanceof ACL) &&
		typeof declaredDefault !== 'function'
	) {
		throw new TypeError(`${path}.default must be an ACL or a function`)
	}
	const declaredResolver: unknown = value.resolveInput
	if (
		declaredResolver !== undefined &&
		typeof declaredResolver !== 'function'
	) {
		throw new TypeError(`${path}.resolveInput must be a function`)
	}

	// Callback signatures cannot be checked at runtime; the static option type owns them.
	const normalized: NormalizedACLSchemaOption = immutableRecord({
		default:
			declaredDefault === undefined
				? new ACL()
				: (declaredDefault as ACL | ACLDefaultFactory),
		resolveInput: declaredResolver as ACLInputResolver | undefined,
		limits: normalizeACLEntryLimits(value.limits, `${path}.limits`),
	})
	normalizedOptions.set(normalized, normalized)
	return normalized
}

/** Keeps ACL available from source and resolves exact sibling fields through the generated graph. */
export const aclSchemaOption: SchemaOptionDefinition<
	NormalizedACLSchemaOption,
	SchemaOptionRuntimeRequirement,
	SourceACLSchemaOption
> = defineSchemaOption({
	normalize: normalizeACLSchemaOption,
	protocolVersion: 1,
	typegen: {
		generic: 'self',
		module: '@ultimabase/acl-permissions-plugin',
		type: 'ACLSchemaOption',
	},
	valueKind: 'opaque',
})

/** Maps every ACL-enabled schema, in registry order, to its trusted option. */
export const readProtectedSchemaOptions = (
	schemas: CompiledSchemaRegistry,
): ReadonlyMap<SchemaDefinition, NormalizedACLSchemaOption> => {
	const options = new Map<SchemaDefinition, NormalizedACLSchemaOption>()

	for (const schema of schemas.values()) {
		if (!Object.hasOwn(schema.definition, 'acl')) continue
		const value: unknown = Reflect.get(schema.definition, 'acl')
		const option = isPlainRecord(value)
			? normalizedOptions.get(value)
			: undefined

		if (option === undefined) {
			throw new TypeError('ACL plugin received an untrusted schema option')
		}
		options.set(schema, option)
	}
	return options
}

import {
	type ContextualSchemaExtensionFactory,
	type RequestSubjectContext,
	defineContextualSchemaExtensionFactory,
	definePluginField,
	defineSchemaExtension,
	type PluginFieldDefinition,
	type PointerValue,
	type SchemaExtension,
	type SchemaExtensionContextKind,
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

/** Identifies the schema extension owned by the official ACL plugin. */
export const aclSchemaExtensionName = 'ultimabase.acl.schema' as const

/** Identifies the optional plugin that executes ACL behavior. */
export const aclPluginName = 'ultimabase.acl' as const

/** Names the logical field injected into every ACL-enabled schema. */
export const aclFieldName = 'acl' as const

/** Identifies the adapter-neutral ACL value field handled by official plugins. */
export const aclFieldKind = 'ultimabase.acl' as const

interface ACLFieldOptions {
	readonly indexed: true
	readonly validation: Readonly<{ readonly required: true }>
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

const aclField = definePluginField(
	aclFieldKind,
	{ indexed: true, validation: { required: true } },
	{
		// The ACL plugin supplies missing create values after ordinary fields resolve.
		deferRequiredUntilResolveInput: true,
		snapshotValue: snapshotACL,
		// Public ACL JSON is already versioned and strictly validated in both directions.
		storageCodec: {
			decode: (value) => ACL.fromJSON(value),
			encode: (value) => value.toJSON(),
			format: 'json',
			version: 1,
		},
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

/** Configures ACL generation and accepted input for one schema. */
export interface ACLSchemaOptions<
	TData extends Readonly<Record<string, unknown>> = Readonly<
		Record<string, unknown>
	>,
> {
	/** Supplies one static ACL or derives it from the field-resolved create candidate. */
	readonly default?: ACL | ACLDefaultFactory<TData>
	/** Accepts and resolves explicit ACL input for create and update operations. */
	readonly resolveInput?: ACLInputResolver<TData>
	/**
	 * Overrides either plugin-level limit for this schema only.
	 *
	 * Omitted values continue to inherit the corresponding plugin limit.
	 *
	 * @example `limits: { maxPrincipals: 25, maxRoles: 10 }`
	 */
	readonly limits?: ACLSchemaLimits
}

/** Carries normalized ACL configuration without executable Core behavior. */
export interface ACLSchemaExtensionConfig<
	TData extends Readonly<Record<string, unknown>> = Readonly<
		Record<string, unknown>
	>,
> {
	readonly default: ACL | ACLDefaultFactory<TData>
	readonly resolveInput: ACLInputResolver<TData> | undefined
	readonly limits: Readonly<ACLSchemaLimits> | undefined
}

/** Represents the exact extension returned by `acl()`. */
export type ACLSchemaExtension<
	TData extends Readonly<Record<string, unknown>> = Readonly<
		Record<string, unknown>
	>,
> = SchemaExtension<
	typeof aclSchemaExtensionName,
	ACLSchemaExtensionConfig<TData>,
	typeof aclPluginName,
	Readonly<{ readonly acl: ACLField }>
>

type ACLContextData<TData> =
	TData extends Readonly<Record<string, unknown>> ? TData : never

interface ACLSchemaExtensionContextKind extends SchemaExtensionContextKind {
	readonly options: ACLSchemaOptions<ACLContextData<this['data']>>
	readonly extension: ACLSchemaExtension<ACLContextData<this['data']>>
}

/** Carries the ordinary and sibling-field-bound ACL factory call signatures. */
export interface ACLSchemaExtensionFactory extends ContextualSchemaExtensionFactory<ACLSchemaExtensionContextKind> {
	<
		const TData extends Readonly<Record<string, unknown>> = Readonly<
			Record<string, unknown>
		>,
	>(
		options?: ACLSchemaOptions<TData>,
	): ACLSchemaExtension<TData>
}

/** Creates one ACL extension while preserving an optional explicit data contract. */
const createACL = <
	const TData extends Readonly<Record<string, unknown>> = Readonly<
		Record<string, unknown>
	>,
>(
	options: ACLSchemaOptions<TData> = {},
): ACLSchemaExtension<TData> => {
	const untrustedOptions: unknown = options

	if (!isPlainRecord(untrustedOptions)) {
		throw new TypeError('acl options must be a plain object')
	}

	if (
		options.default !== undefined &&
		!(options.default instanceof ACL) &&
		typeof options.default !== 'function'
	) {
		throw new TypeError('acl default must be an ACL or a function')
	}

	if (
		options.resolveInput !== undefined &&
		typeof options.resolveInput !== 'function'
	) {
		throw new TypeError('acl resolveInput must be a function')
	}

	const config: ACLSchemaExtensionConfig<TData> = immutableRecord({
		default: options.default ?? new ACL(),
		resolveInput: options.resolveInput,
		limits: normalizeACLEntryLimits(options.limits, 'acl limits'),
	})

	return defineSchemaExtension(aclSchemaExtensionName, config, aclPluginName, {
		fields: { acl: aclField },
	})
}

/**
 * Enables persisted object ACL for one schema without changing Core Runtime.
 *
 * Omitted ACL input receives the configured default after ordinary field input
 * hooks have resolved. Explicit ACL input is rejected unless `resolveInput` is
 * declared, while `aclPlugin()` owns all executable policy behavior.
 *
 * @example
 * ```ts
 * extensions: ({ bind }) => [
 *   bind(acl, {
 *     default: ({ data, principal }) =>
 *       data.visibility === "public"
 *         ? new ACL().grantPublic('read')
 *         : principal === undefined
 *           ? new ACL()
 *           : new ACL().grantPrincipal(principal, 'read', 'update'),
 *   }),
 * ]
 * ```
 */
export const acl: ACLSchemaExtensionFactory =
	defineContextualSchemaExtensionFactory<ACLSchemaExtensionContextKind>()(
		createACL,
	)

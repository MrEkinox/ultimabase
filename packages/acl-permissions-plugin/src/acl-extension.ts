import {
	definePluginField,
	defineSchemaExtension,
	type HookContext,
	type PluginFieldDefinition,
	type PointerValue,
	type SchemaExtension,
} from '@ultimabase/core'
import {
	immutableRecord,
	isPlainRecord,
	type MaybePromise,
} from '@ultimabase/shared'

import { ACL } from './acl.js'

/** Identifies the schema extension owned by the official ACL plugin. */
export const aclSchemaExtensionName = 'ultimabase.acl.schema' as const

/** Identifies the optional plugin that executes ACL behavior. */
export const aclPluginName = 'ultimabase.acl' as const

/** Names the logical field injected into every ACL-enabled schema. */
export const aclFieldName = 'acl' as const

/** Identifies the adapter-neutral ACL value field handled by official plugins. */
export const aclFieldKind = 'ultimabase.acl' as const

interface ACLFieldOptions {
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
	}>
>

const snapshotACL = (value: unknown, path: string): ACL => {
	if (!(value instanceof ACL)) {
		throw new TypeError(`${path} must be an ACL`)
	}

	return value
}

const aclField = definePluginField(
	aclFieldKind,
	{ validation: { required: true } },
	{
		// The ACL plugin supplies missing create values after ordinary fields resolve.
		deferRequiredUntilResolveInput: true,
		snapshotValue: snapshotACL,
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
	readonly context: HookContext
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
	readonly inputAcl: ACL | undefined
	readonly currentAcl: undefined
	readonly data: TData
	readonly principal: PointerValue | undefined
	readonly context: HookContext
}

/** Supplies the shared facts available while resolving update ACL input. */
export interface ACLUpdateInputResolution<
	TData extends Readonly<Record<string, unknown>> = Readonly<
		Record<string, unknown>
	>,
> {
	readonly operation: 'update'
	readonly inputAcl: ACL | undefined
	readonly currentAcl: ACL
	readonly data: TData
	readonly principal: PointerValue | undefined
	readonly context: HookContext
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
export interface ACLSchemaLimits {
	readonly maxPrincipals?: number
	readonly maxRoles?: number
}

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
	/** Overrides the plugin's default principal and role entry limits. */
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

const assertLimit = (value: unknown, path: string): number => {
	if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
		throw new RangeError(`${path} must be a non-negative safe integer`)
	}

	return value
}

const normalizeLimits = (
	limits: ACLSchemaLimits | undefined,
): Readonly<ACLSchemaLimits> | undefined => {
	if (limits === undefined) return undefined

	if (!isPlainRecord(limits)) {
		throw new TypeError('acl limits must be a plain object')
	}

	const unknownKeys = Object.keys(limits).filter(
		(key) => key !== 'maxPrincipals' && key !== 'maxRoles',
	)

	if (unknownKeys.length > 0) {
		throw new TypeError(`Unknown acl limit: ${unknownKeys[0]}`)
	}

	return immutableRecord({
		...(limits.maxPrincipals === undefined
			? {}
			: { maxPrincipals: assertLimit(limits.maxPrincipals, 'maxPrincipals') }),
		...(limits.maxRoles === undefined
			? {}
			: { maxRoles: assertLimit(limits.maxRoles, 'maxRoles') }),
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
 * extensions: [
 *   acl({
 *     default: ({ principal }) =>
 *       principal === undefined
 *         ? new ACL().grantPublic('read')
 *         : new ACL().grantPrincipal(principal, 'read', 'manageAcl'),
 *   }),
 * ]
 * ```
 */
export const acl = <
	const TData extends Readonly<Record<string, unknown>> = Readonly<
		Record<string, unknown>
	>,
>(options: ACLSchemaOptions<TData> = {}): ACLSchemaExtension<TData> => {
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
		limits: normalizeLimits(options.limits),
	})

	return defineSchemaExtension(
		aclSchemaExtensionName,
		config,
		aclPluginName,
		{ fields: { acl: aclField } },
	)
}

import {
	definePluginField,
	definePluginFieldFamily,
	definePluginFieldWireProtocol,
	type CompiledSchemaRegistry,
	type FieldContainsInputCarrier,
	type FieldUpdateInputCarrier,
	type PluginFieldDefinition,
	type PluginFieldExistingRows,
	type PluginFieldFamilyDefinition,
	type Principal,
	type RequestSubjectContext,
	type SchemaDefinition,
} from '@ultimabase/core'
import {
	defineSchemaOption,
	type SchemaOptionDefinition,
} from '@ultimabase/core/plugin'
import {
	immutableRecord,
	isPlainRecord,
	type MaybePromise,
} from '@ultimabase/shared'

import { ACL } from './acl.js'
import { snapshotACLUpdateInput, type ACLChangeInput } from './acl-change.js'
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

/** Declares the ACL field kind without exposing a schema FieldBuilder method. */
export const aclFieldFamily: PluginFieldFamilyDefinition<typeof aclFieldKind> =
	definePluginFieldFamily({ fieldKind: aclFieldKind })

interface ACLFieldOptions {
	readonly indexed: true
	readonly required: true
}

/**
 * Carries one non-null immutable ACL through ordinary schema inference;
 * updates also accept `{ grant }` and `{ revoke }` (ADR-0321).
 */
export type ACLField = FieldContainsInputCarrier<ACLContainmentOperand> &
	FieldUpdateInputCarrier<ACLChangeInput> &
	PluginFieldDefinition<
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

/** Supplies resolved create data to one schema-local ACL default factory. */
export interface ACLDefaultInput<
	TData extends Readonly<Record<string, unknown>> = Readonly<
		Record<string, unknown>
	>,
> {
	/** Exposes the readonly field-resolved create candidate without the ACL field. */
	readonly data: TData
	/** The current request principal resolved by Core, `undefined` when anonymous. */
	readonly principal: Principal | undefined
	/** Exposes the active transaction-bound hook context. */
	readonly context: RequestSubjectContext
}

/** Derives one immutable ACL independently for every created object. */
export type ACLDefaultFactory<
	TData extends Readonly<Record<string, unknown>> = Readonly<
		Record<string, unknown>
	>,
> = (input: ACLDefaultInput<TData>) => MaybePromise<ACL>

/** What `resolveInput` receives when a row is created. */
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
	readonly currentAcl: undefined
	readonly principal: Principal | undefined
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

/** What `resolveInput` receives when one row is updated. */
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
	readonly currentAcl: ACL
	readonly principal: Principal | undefined
	readonly context: RequestSubjectContext
}

/**
 * Recomputes the ACL from the row's data on each create and singular update
 * that carries no explicit ACL; `undefined` keeps the default (create) or the
 * current ACL (update).
 */
export type ACLInputResolver<
	TData extends Readonly<Record<string, unknown>> = Readonly<
		Record<string, unknown>
	>,
> = (
	input: ACLCreateInputResolution<TData> | ACLUpdateInputResolution<TData>,
) => MaybePromise<ACL | undefined>

/** What `clientSharing` receives for one locked row. */
export interface ACLClientSharingInput {
	/** The current request principal, `undefined` when anonymous. */
	readonly principal: Principal | undefined
	/** The row's ACL before the change. */
	readonly currentAcl: ACL
}

/**
 * Lets a non-Master caller read the ACL of a row and apply `grant`/`revoke`
 * to it when this returns `true` (ADR-0321).
 */
export type ACLClientSharing = (
	input: ACLClientSharingInput,
) => MaybePromise<boolean>

/** Overrides application ACL entry limits for one schema. */
export type ACLSchemaLimits = ACLEntryLimits

/** The `acl` entry of `.with({ ... })` once `.acl()` is called (ADR-0321). */
export interface ACLRule<
	TData extends Readonly<Record<string, unknown>> = Readonly<
		Record<string, unknown>
	>,
> {
	/**
	 * The ACL of each created row: one ACL, or a function of the created
	 * values and the request principal. Required: an empty ACL would hide the
	 * row from everyone but Master.
	 * @example `default: ({ principal }) => new ACL(principal)`
	 */
	readonly default: ACL | ACLDefaultFactory<TData>
	/**
	 * The ACL rows already in the table receive when `.acl()` is added to a
	 * schema whose `default` is a function.
	 * @example `existingRows: new ACL().grantAuthenticated('read')`
	 */
	readonly existingRows?: ACL
	/**
	 * Recomputes the ACL from the row's data on each create and singular
	 * update that carries no explicit ACL.
	 * @example `resolveInput: ({ data }) => data.archived ? new ACL() : undefined`
	 */
	readonly resolveInput?: ACLInputResolver<TData>
	/**
	 * Lets clients read the ACL of the rows it allows and `grant`/`revoke` on
	 * them; a client never grants rights it does not hold itself.
	 * @example `clientSharing: ({ principal, currentAcl }) => principal !== undefined && currentAcl.hasPrincipalPermission(principal, 'delete')`
	 */
	readonly clientSharing?: ACLClientSharing
	/**
	 * Overrides either plugin-level limit for this schema only.
	 * @example `limits: { maxPrincipals: 25, maxRoles: 10 }`
	 */
	readonly limits?: ACLSchemaLimits
}

/** Carries one trusted normalized ACL rule. */
export interface NormalizedACLSchemaOption<
	TData extends Readonly<Record<string, unknown>> = Readonly<
		Record<string, unknown>
	>,
> {
	readonly default: ACL | ACLDefaultFactory<TData>
	readonly existingRows: ACL | undefined
	readonly resolveInput: ACLInputResolver<TData> | undefined
	readonly clientSharing: ACLClientSharing | undefined
	readonly limits: Readonly<ACLSchemaLimits> | undefined
}

const aclRuleKeys = new Set([
	'clientSharing',
	'default',
	'existingRows',
	'limits',
	'resolveInput',
])
// Only options produced here are trusted; the map also restores their exact type.
const normalizedOptions = new WeakMap<object, NormalizedACLSchemaOption>()

/** The option `.acl()` sets until `.with({ acl })` replaces it. */
export const aclShapeDeclared: Readonly<Record<never, never>> = Object.freeze(
	{},
)

/** Normalizes one `acl` rule without executing application callbacks. */
export const normalizeACLSchemaOption = (
	value: unknown,
	path: string,
): NormalizedACLSchemaOption => {
	if (value === aclShapeDeclared) {
		throw new TypeError(
			`${path}: .acl() needs .with({ acl: { default } }); an empty ACL would hide every row from everyone but Master`,
		)
	}
	if (!isPlainRecord(value)) {
		throw new TypeError(`${path} must be a plain object`)
	}
	const unknownKey = Reflect.ownKeys(value).find(
		(key) => typeof key !== 'string' || !aclRuleKeys.has(key),
	)
	if (unknownKey !== undefined) {
		throw new TypeError(`Unknown ${path} option: ${String(unknownKey)}`)
	}

	const declaredDefault: unknown = value.default
	if (
		!(declaredDefault instanceof ACL) &&
		typeof declaredDefault !== 'function'
	) {
		throw new TypeError(`${path}.default must be an ACL or a function`)
	}
	const existingRows: unknown = value.existingRows
	if (existingRows !== undefined && !(existingRows instanceof ACL)) {
		throw new TypeError(`${path}.existingRows must be an ACL`)
	}
	const declaredResolver: unknown = value.resolveInput
	const declaredSharing: unknown = value.clientSharing
	for (const [key, callback] of [
		['resolveInput', declaredResolver],
		['clientSharing', declaredSharing],
	] as const) {
		if (callback !== undefined && typeof callback !== 'function') {
			throw new TypeError(`${path}.${key} must be a function`)
		}
	}

	// Callback signatures cannot be checked at runtime; the static rule type owns them.
	const normalized: NormalizedACLSchemaOption = immutableRecord({
		default: declaredDefault as ACL | ACLDefaultFactory,
		existingRows,
		resolveInput: declaredResolver as ACLInputResolver | undefined,
		clientSharing: declaredSharing as ACLClientSharing | undefined,
		limits: normalizeACLEntryLimits(
			value.limits as ACLEntryLimits | undefined,
			`${path}.limits`,
		),
	})
	normalizedOptions.set(normalized, normalized)
	return normalized
}

/** The `acl` option: set by `.acl()`, configured by `.with({ acl })`. */
export const aclSchemaOption: SchemaOptionDefinition<NormalizedACLSchemaOption> =
	defineSchemaOption({
		normalize: normalizeACLSchemaOption,
		protocolVersion: 1,
		valueKind: 'opaque',
	})

/** Reads the trusted ACL rule of one compiled schema, if it calls `.acl()`. */
export const readACLRule = (
	schema: SchemaDefinition,
): NormalizedACLSchemaOption | undefined => {
	if (!Object.hasOwn(schema.definition, 'acl')) return undefined
	const value: unknown = Reflect.get(schema.definition, 'acl')
	const option = isPlainRecord(value) ? normalizedOptions.get(value) : undefined
	if (option === undefined) {
		throw new TypeError('ACL plugin received an untrusted schema option')
	}
	return option
}

/** Maps every ACL-enabled schema, in registry order, to its trusted option. */
export const readProtectedSchemaOptions = (
	schemas: CompiledSchemaRegistry,
): ReadonlyMap<SchemaDefinition, NormalizedACLSchemaOption> =>
	new Map(
		schemas.values().flatMap((schema) => {
			const option = readACLRule(schema)
			return option === undefined ? [] : [[schema, option] as const]
		}),
	)

/** What rows already in a table receive when the `acl` column is added (ADR-0321). */
const readExistingRows = (
	schema: SchemaDefinition,
): PluginFieldExistingRows<ACL> => {
	const rule = readACLRule(schema)
	const fixed =
		rule?.existingRows ??
		(rule?.default instanceof ACL ? rule.default : undefined)
	return fixed === undefined
		? immutableRecord({
				missing: `${schema.className} has rows and its acl.default is a function, so they need a fixed ACL: add existingRows to .with({ acl: { default, existingRows } }), or empty the table, then start again.`,
			})
		: immutableRecord({ value: fixed })
}

/** Defines the adapter-neutral field `.acl()` adds. */
export const aclField = definePluginField(
	aclFieldKind,
	{ indexed: true, required: true },
	{
		// The ACL plugin supplies missing create values after ordinary fields resolve.
		deferRequiredUntilResolveInput: true,
		snapshotValue: snapshotACL,
		snapshotUpdateInput: snapshotACLUpdateInput,
		existingRows: readExistingRows,
		// Rows written after a schema stops calling `.acl()` get an empty ACL.
		storageDefault: new ACL(),
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

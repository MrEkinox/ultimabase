import type {
	ApplicationSchemaMutationDescriptor,
	GenericField,
	OperationKind,
	SchemaDefinition,
} from '@ultimabase/core'
import {
	nativeCommandCatalog,
	type CommandKeyEntry,
	type NativeCommandCatalogEntry,
} from '@ultimabase/core/plugin'
import { immutableRecord } from '@ultimabase/shared'

import type { AllowWithoutRulePlan } from './allow-without-rule.js'
import type {
	NormalizedAccessRule,
	SchemaItemAccessFamily,
} from './declarations.js'
import type {
	FieldReadAccessChannel,
	FieldWriteAccessTransition,
} from './field-declarations.js'

export type AccessOperationFamily =
	'create' | 'delete' | 'read' | 'update' | 'upsert'

/** The policy `operation` key of a read terminal (`one`, `many`, …). */
type SchemaReadAccessBranch = 'count' | 'exists' | 'many' | 'one'

/** Names the policy operation of one terminal: a read branch or a family. */
export type AccessOperationSlot =
	Exclude<AccessOperationFamily, 'read'> | SchemaReadAccessBranch

const accessOperationSlots = immutableRecord({
	'find-many': 'many',
	'find-one': 'one',
	get: 'one',
	count: 'count',
	exists: 'exists',
	'create-one': 'create',
	'create-many': 'create',
	'update-one': 'update',
	'update-many': 'update',
	'upsert-one': 'upsert',
	'upsert-many': 'upsert',
	'delete-one': 'delete',
	'delete-many': 'delete',
} satisfies Readonly<Record<OperationKind, AccessOperationSlot>>)

/** Lists every Runtime terminal once for exhaustive Access-plan lookup. */
export const accessOperationKinds: readonly OperationKind[] = [
	'find-many',
	'find-one',
	'get',
	'count',
	'exists',
	'create-one',
	'create-many',
	'update-one',
	'update-many',
	'upsert-one',
	'upsert-many',
	'delete-one',
	'delete-many',
]

export const isReadAccessSlot = (
	slot: AccessOperationSlot,
): slot is SchemaReadAccessBranch =>
	slot === 'one' || slot === 'many' || slot === 'count' || slot === 'exists'

const nativeEntries = new Map(
	nativeCommandCatalog.map((entry) => [entry.operationKind, entry]),
)

/**
 * Places one native terminal in Core's operation vocabulary (ADR-0347): a
 * `get` is a `findOne`.
 */
export const readAccessCommandEntry = (
	kind: OperationKind,
): NativeCommandCatalogEntry => {
	const entry = nativeEntries.get(kind === 'get' ? 'find-one' : kind)
	if (entry === undefined) throw new TypeError(`Unknown operation ${kind}`)
	return entry
}

/**
 * Names the key that opens one entry in messages: a read method
 * (`findMany`, `count`) or a write operation (`create`, `softDelete`).
 */
export const readAccessBranch = (
	entry: Pick<NativeCommandCatalogEntry, 'group' | 'method' | 'operation'>,
): string => (entry.group === 'read' ? entry.method : entry.operation)

/** Resolves one native terminal to its policy operation key. */
export const readAccessOperationSlot = (
	kind: OperationKind,
): AccessOperationSlot => accessOperationSlots[kind]

/** Resolves one native terminal to its single public Access family. */
export const readAccessOperationFamily = (
	kind: OperationKind,
): AccessOperationFamily => {
	const slot = accessOperationSlots[kind]
	return isReadAccessSlot(slot) ? 'read' : slot
}

/** Fields stay available until one exact field declaration narrows them. */
export const allowUndeclaredFieldAccess = true as const

/** Attributes one native declaration without inventing plugin provenance. */
export interface DeveloperAccessSource {
	readonly kind: 'developer'
}

/** Retains exact plugin ownership for deterministic policy diagnostics. */
export interface PluginAccessSource {
	readonly kind: 'plugin'
	readonly localName: string
	readonly ownerPlugin: string
	readonly ownerInstanceId?: string
	readonly targetKind: 'field' | 'field-kind' | 'global' | 'schema'
}

export type AccessRuleSource = DeveloperAccessSource | PluginAccessSource

export interface CompiledAccessRule {
	/** Where the rule is declared, for denial diagnostics (`Post.access.update`). */
	readonly location: string
	readonly rule: NormalizedAccessRule
	readonly source: AccessRuleSource
	/** `filter` for the `where` member of a detailed rule (ADR-0317). */
	readonly step: 'filter' | 'operation'
}

export type CompiledAccessRuleMap<TKey extends string> = Readonly<
	Record<TKey, readonly CompiledAccessRule[]>
>

export interface FieldAccessPlan {
	readonly field: GenericField
	readonly path: readonly string[]
	readonly read: CompiledAccessRuleMap<FieldReadAccessChannel>
	readonly relationWrite: readonly CompiledAccessRule[]
	readonly write: CompiledAccessRuleMap<FieldWriteAccessTransition>
}

export interface SchemaMutationAccessPlan {
	readonly descriptor: ApplicationSchemaMutationDescriptor
	/** The command placed in Core's vocabulary: method, operation, `write`. */
	readonly entry: CommandKeyEntry
	readonly item: readonly CompiledAccessRule[]
	readonly operation: readonly CompiledAccessRule[]
}

export interface SchemaAccessPlan {
	readonly fields: readonly FieldAccessPlan[]
	readonly item: CompiledAccessRuleMap<SchemaItemAccessFamily>
	readonly operation: CompiledAccessRuleMap<OperationKind>
	/** Rules of the plugin permissions declared on this schema, by name. */
	readonly permissions: ReadonlyMap<string, readonly CompiledAccessRule[]>
	readonly schemaMutations: ReadonlyMap<string, SchemaMutationAccessPlan>
	readonly schema: SchemaDefinition
}

export interface AccessPlan {
	readonly allowWithoutRule: AllowWithoutRulePlan
	getField(
		schema: SchemaDefinition,
		path: readonly string[],
	): FieldAccessPlan | undefined
	getFields(
		schema: SchemaDefinition,
		field: GenericField,
	): readonly FieldAccessPlan[]
	getSchema(schema: SchemaDefinition): SchemaAccessPlan | undefined
}

/** Encodes field segments without assigning syntax to developer characters. */
export const encodeFieldPath = (path: readonly string[]): string =>
	path.map((segment) => `${String(segment.length)}:${segment}`).join('')

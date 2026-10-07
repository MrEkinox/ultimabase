import type {
	ApplicationSchemaMutationDescriptor,
	GenericField,
	OperationKind,
	SchemaDefinition,
} from '@ultimabase/core'
import { immutableRecord } from '@ultimabase/shared'

import type {
	FieldReadAccessChannel,
	FieldWriteAccessTransition,
	NormalizedAccessRule,
	SchemaFilterAccessFamily,
	SchemaItemAccessFamily,
	SchemaReadAccessBranch,
} from './declarations.js'

export type AccessOperationFamily =
	'create' | 'delete' | 'read' | 'update' | 'upsert'

/** Names the public decision that owns one terminal: a read branch or a family. */
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

/** Resolves one native terminal to its public read branch or family. */
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

export interface AccessDefaultPolicy {
	readonly create: boolean
	readonly delete: boolean
	readonly read: Readonly<Record<SchemaReadAccessBranch, boolean>>
	readonly update: boolean
	readonly upsert: boolean
	readonly schemaMutations: boolean
}

/** Resolves one terminal through the public operation-family defaults. */
export const readAccessOperationDefault = (
	defaults: AccessDefaultPolicy,
	kind: OperationKind,
): boolean => {
	const slot = accessOperationSlots[kind]
	return isReadAccessSlot(slot) ? defaults.read[slot] : defaults[slot]
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
	readonly rule: NormalizedAccessRule
	readonly source: AccessRuleSource
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
	readonly filter: readonly CompiledAccessRule[]
	readonly item: readonly CompiledAccessRule[]
	readonly operation: readonly CompiledAccessRule[]
}

export interface SchemaAccessPlan {
	readonly fields: readonly FieldAccessPlan[]
	readonly filter: CompiledAccessRuleMap<SchemaFilterAccessFamily>
	readonly item: CompiledAccessRuleMap<SchemaItemAccessFamily>
	readonly operation: CompiledAccessRuleMap<OperationKind>
	readonly schemaMutations: ReadonlyMap<string, SchemaMutationAccessPlan>
	readonly schema: SchemaDefinition
}

export interface AccessPlan {
	readonly defaults: AccessDefaultPolicy
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

import type {
	GenericField,
	OperationKind,
	SchemaContributionOwner,
	SchemaDefinition,
} from '@ultimabase/core'
import { immutableArray } from '@ultimabase/shared'

import type {
	FieldReadAccessChannel,
	FieldWriteAccessTransition,
} from './field-declarations.js'
import type {
	SchemaFilterAccessFamily,
	SchemaItemAccessFamily,
	SchemaReadAccessBranch,
} from './declarations.js'
import type { NormalizedAccessRule } from './normalization.js'

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

export interface SchemaAccessPlan {
	readonly fields: readonly FieldAccessPlan[]
	readonly filter: CompiledAccessRuleMap<SchemaFilterAccessFamily>
	readonly item: CompiledAccessRuleMap<SchemaItemAccessFamily>
	readonly operation: CompiledAccessRuleMap<OperationKind>
	readonly schema: SchemaDefinition
}

export interface AccessPlan {
	readonly defaults: AccessDefaultPolicy
	readonly schemas: readonly SchemaAccessPlan[]
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

export interface AccessDefaultPolicy {
	readonly create: boolean
	readonly delete: boolean
	readonly read: Readonly<Record<SchemaReadAccessBranch, boolean>>
	readonly update: boolean
	readonly upsert: boolean
}

/** Fields stay available until one exact field declaration narrows them. */
export const allowUndeclaredFieldAccess = true as const

/** Resolves one terminal through the public operation-family defaults. */
export const readAccessOperationDefault = (
	defaults: AccessDefaultPolicy,
	kind: OperationKind,
): boolean => {
	switch (kind) {
		case 'get':
		case 'find-one':
			return defaults.read.one
		case 'find-many':
			return defaults.read.many
		case 'count':
			return defaults.read.count
		case 'exists':
			return defaults.read.exists
		case 'create-one':
		case 'create-many':
			return defaults.create
		case 'update-one':
		case 'update-many':
			return defaults.update
		case 'upsert-one':
		case 'upsert-many':
			return defaults.upsert
		case 'delete-one':
		case 'delete-many':
			return defaults.delete
	}
}

export type MutableAccessRuleMap<TKey extends string> = Record<
	TKey,
	CompiledAccessRule[]
>

export interface MutableFieldAccessPlan {
	readonly field: GenericField
	readonly inlineOwner: SchemaContributionOwner
	readonly path: readonly string[]
	readonly read: MutableAccessRuleMap<FieldReadAccessChannel>
	readonly relationWrite: CompiledAccessRule[]
	readonly write: MutableAccessRuleMap<FieldWriteAccessTransition>
}

export interface MutableSchemaAccessPlan {
	readonly fields: readonly MutableFieldAccessPlan[]
	readonly fieldsByPath: ReadonlyMap<string, MutableFieldAccessPlan>
	readonly filter: MutableAccessRuleMap<SchemaFilterAccessFamily>
	readonly item: MutableAccessRuleMap<SchemaItemAccessFamily>
	readonly operation: MutableAccessRuleMap<OperationKind>
	readonly schema: SchemaDefinition
	readonly schemaInlineOwner: SchemaContributionOwner
}

export interface SchemaAccessPlanLookup {
	readonly fieldsByIdentity: WeakMap<object, readonly FieldAccessPlan[]>
	readonly fieldsByPath: ReadonlyMap<string, FieldAccessPlan>
	readonly plan: SchemaAccessPlan
}

export const emptyFieldAccessPlans: readonly FieldAccessPlan[] = immutableArray(
	[],
)

/** Encodes field segments without assigning syntax to developer characters. */
export const encodeFieldPath = (path: readonly string[]): string =>
	path.map((segment) => `${String(segment.length)}:${segment}`).join('')

import type {
	GenericField,
	OperationKind,
	SchemaContributionOwner,
	SchemaDefinition,
} from '@ultimabase/core'
import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
} from '@ultimabase/shared'
import type {
	FieldAccessDeclarations,
	FieldReadAccessChannel,
	FieldWriteAccessTransition,
} from './field-declarations.js'
import {
	fieldReadAccessChannels,
	fieldWriteAccessTransitions,
} from './field-declarations.js'
import type {
	SchemaAccessDeclarations,
	SchemaFilterAccessFamily,
	SchemaItemAccessFamily,
	SchemaReadAccessBranch,
} from './declarations.js'
import {
	schemaFilterAccessFamilies,
	schemaItemAccessFamilies,
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
	readonly master: 'enforce'
}

/** Retains exact plugin ownership for deterministic policy diagnostics. */
export interface PluginAccessSource {
	readonly kind: 'plugin'
	readonly localName: string
	readonly master: 'bypass' | 'enforce'
	readonly ownerPlugin: string
	readonly ownerInstanceId?: string
	readonly targetKind:
		| 'field'
		| 'field-extension'
		| 'field-kind'
		| 'global'
		| 'schema'
		| 'schema-extension'
}

/** Identifies the immutable source of one compiled decision. */
export type AccessRuleSource = DeveloperAccessSource | PluginAccessSource

/** Couples one normalized rule to its master and diagnostic semantics. */
export interface CompiledAccessRule {
	readonly rule: NormalizedAccessRule
	readonly source: AccessRuleSource
}

export type CompiledAccessRuleMap<TKey extends string> = Readonly<
	Record<TKey, readonly CompiledAccessRule[]>
>

/** Retains one field's rules at its exact structural path. */
export interface FieldAccessPlan {
	readonly field: GenericField
	readonly path: readonly string[]
	readonly read: CompiledAccessRuleMap<FieldReadAccessChannel>
	readonly relationWrite: readonly CompiledAccessRule[]
	readonly write: CompiledAccessRuleMap<FieldWriteAccessTransition>
}

/** Retains every normalized schema-level and field-level Access decision. */
export interface SchemaAccessPlan {
	readonly fields: readonly FieldAccessPlan[]
	readonly filter: CompiledAccessRuleMap<SchemaFilterAccessFamily>
	readonly item: CompiledAccessRuleMap<SchemaItemAccessFamily>
	readonly operation: CompiledAccessRuleMap<OperationKind>
	readonly schema: SchemaDefinition
}

/** Supplies immutable application-owned plans and exact identity lookups. */
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

/** Selects the fallback only when no exact operation or field rule exists. */
export interface AccessDefaultPolicy {
	readonly field: boolean
	readonly operation: boolean
}

type MutableAccessRuleMap<TKey extends string> = Record<
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

const developerAccessSource: DeveloperAccessSource = immutableRecord({
	kind: 'developer',
	master: 'enforce',
})
export const emptyFieldAccessPlans: readonly FieldAccessPlan[] = immutableArray(
	[],
)

/** Encodes field segments without assigning syntax to developer characters. */
export const encodeFieldPath = (path: readonly string[]): string =>
	path.map((segment) => `${String(segment.length)}:${segment}`).join('')

const createMutableRuleMap = <const TKey extends string>(
	keys: readonly TKey[],
): MutableAccessRuleMap<TKey> => {
	const rules = {} as MutableAccessRuleMap<TKey>

	for (const key of keys) {
		rules[key] = []
	}

	return rules
}

const finalizeRuleMap = <const TKey extends string>(
	keys: readonly TKey[],
	rules: MutableAccessRuleMap<TKey>,
): CompiledAccessRuleMap<TKey> => {
	const finalized = {} as Record<TKey, readonly CompiledAccessRule[]>

	for (const key of keys) {
		finalized[key] = immutableArray(rules[key])
	}

	return immutableRecord(finalized)
}

const createCompiledRule = (
	rule: NormalizedAccessRule,
	source: AccessRuleSource,
): CompiledAccessRule => immutableRecord({ rule, source })

const appendRule = <TKey extends string>(
	rules: MutableAccessRuleMap<TKey>,
	key: TKey,
	rule: NormalizedAccessRule,
	source: AccessRuleSource,
): void => {
	rules[key].push(createCompiledRule(rule, source))
}

const appendRuleToKinds = (
	rules: MutableAccessRuleMap<OperationKind>,
	kinds: readonly OperationKind[],
	rule: NormalizedAccessRule,
	source: AccessRuleSource,
): void => {
	for (const kind of kinds) {
		appendRule(rules, kind, rule, source)
	}
}

const isNormalizedAccessRule = (
	value: unknown,
): value is NormalizedAccessRule =>
	typeof value === 'boolean' || typeof value === 'function'

const schemaReadKinds: Readonly<
	Record<SchemaReadAccessBranch, readonly OperationKind[]>
> = immutableRecord({
	count: immutableArray(['count']),
	exists: immutableArray(['exists']),
	many: immutableArray(['find-many']),
	one: immutableArray(['get', 'find-one']),
})

const schemaOperationFamilyKinds = immutableRecord({
	create: immutableArray(['create-one', 'create-many']),
	delete: immutableArray(['delete-one', 'delete-many']),
	update: immutableArray(['update-one', 'update-many']),
	upsert: immutableArray(['upsert-one', 'upsert-many']),
}) satisfies Readonly<
	Record<'create' | 'delete' | 'update' | 'upsert', readonly OperationKind[]>
>

/** Expands concise and grouped schema reads into terminal-indexed decisions. */
const appendSchemaOperationDeclarations = (
	rules: MutableAccessRuleMap<OperationKind>,
	declarations: NonNullable<SchemaAccessDeclarations['operation']>,
	source: AccessRuleSource,
): void => {
	const read = declarations.read

	if (read !== undefined) {
		if (isNormalizedAccessRule(read)) {
			appendRuleToKinds(
				rules,
				['get', 'find-one', 'find-many', 'count', 'exists'],
				read,
				source,
			)
		} else {
			for (const branch of Object.keys(
				schemaReadKinds,
			) as SchemaReadAccessBranch[]) {
				appendRuleToKinds(rules, schemaReadKinds[branch], read[branch], source)
			}
		}
	}

	for (const family of ['create', 'update', 'upsert', 'delete'] as const) {
		const rule = declarations[family]

		if (rule !== undefined) {
			appendRuleToKinds(rules, schemaOperationFamilyKinds[family], rule, source)
		}
	}
}

export const appendSchemaDeclarations = (
	plan: MutableSchemaAccessPlan,
	declarations: SchemaAccessDeclarations,
	source: AccessRuleSource,
): void => {
	if (declarations.operation !== undefined) {
		appendSchemaOperationDeclarations(
			plan.operation,
			declarations.operation,
			source,
		)
	}

	for (const family of schemaFilterAccessFamilies) {
		const rule = declarations.filter?.[family]

		if (rule !== undefined) {
			appendRule(plan.filter, family, rule, source)
		}
	}

	for (const family of schemaItemAccessFamilies) {
		const rule = declarations.item?.[family]

		if (rule !== undefined) {
			appendRule(plan.item, family, rule, source)
		}
	}
}

export const appendFieldDeclarations = (
	plan: MutableFieldAccessPlan,
	declarations: FieldAccessDeclarations,
	source: AccessRuleSource,
): void => {
	const read = declarations.read

	if (read !== undefined) {
		if (isNormalizedAccessRule(read)) {
			for (const channel of fieldReadAccessChannels) {
				appendRule(plan.read, channel, read, source)
			}
		} else {
			for (const channel of fieldReadAccessChannels) {
				appendRule(plan.read, channel, read[channel], source)
			}
		}
	}

	if (declarations.write !== undefined) {
		for (const transition of fieldWriteAccessTransitions) {
			appendRule(plan.write, transition, declarations.write[transition], source)
		}
	}

	if (declarations.relationWrite !== undefined) {
		plan.relationWrite.push(
			createCompiledRule(declarations.relationWrite, source),
		)
	}
}

const collectFields = (
	fields: Readonly<Record<string, GenericField>>,
	inlineOwner: SchemaContributionOwner,
	parent: readonly string[] = immutableArray([]),
): readonly Readonly<{
	readonly field: GenericField
	readonly inlineOwner: SchemaContributionOwner
	readonly path: readonly string[]
}>[] =>
	immutableArray(
		Object.entries(fields).flatMap(([name, field]) => {
			const path = immutableArray([...parent, name])
			const current = immutableRecord({ field, inlineOwner, path })
			const nestedFields: unknown = Reflect.get(field.options, 'fields')

			return field.kind === 'object' && isPlainRecord(nestedFields)
				? [
						current,
						...collectFields(
							nestedFields as Readonly<Record<string, GenericField>>,
							inlineOwner,
							path,
						),
					]
				: [current]
		}),
	)

const readSchemaDeclarations = (
	schema: SchemaDefinition,
): SchemaAccessDeclarations | undefined =>
	Object.hasOwn(schema.definition, 'access')
		? (Reflect.get(schema.definition, 'access') as
				SchemaAccessDeclarations | undefined)
		: undefined

const readFieldDeclarations = (
	field: GenericField,
): FieldAccessDeclarations | undefined =>
	Object.hasOwn(field.options, 'access')
		? (Reflect.get(field.options, 'access') as
				FieldAccessDeclarations | undefined)
		: undefined

export const createMutableSchemaPlan = (
	schema: SchemaDefinition,
): MutableSchemaAccessPlan => {
	const fields = Object.entries(schema.fields).flatMap(([name, field]) => {
		const inlineOwner =
			schema.provenance.fieldOptions[name]?.access?.value.owner ??
			schema.provenance.fields[name]?.owner ??
			schema.provenance.schema.owner

		return collectFields({ [name]: field }, inlineOwner).map(
			({
				field: candidate,
				inlineOwner: owner,
				path,
			}): MutableFieldAccessPlan => ({
				field: candidate,
				inlineOwner: owner,
				path,
				read: createMutableRuleMap(fieldReadAccessChannels),
				relationWrite: [],
				write: createMutableRuleMap(fieldWriteAccessTransitions),
			}),
		)
	})
	const fieldsByPath = new Map<string, MutableFieldAccessPlan>()

	for (const field of fields) {
		fieldsByPath.set(encodeFieldPath(field.path), field)
	}

	return {
		fields,
		fieldsByPath,
		filter: createMutableRuleMap(schemaFilterAccessFamilies),
		item: createMutableRuleMap(schemaItemAccessFamilies),
		operation: createMutableRuleMap(accessOperationKinds),
		schema,
		schemaInlineOwner:
			schema.provenance.options.access?.value.owner ??
			schema.provenance.schema.owner,
	}
}

const assertApplicationOwnedInlineAccess = (
	owner: SchemaContributionOwner,
	path: string,
): void => {
	if (owner.kind === 'application') return

	throw new TypeError(
		`Inline Access at ${path} is owned by ${owner.kind === 'plugin' ? owner.pluginId : owner.kind}; plugins must use provideAccessContributions()`,
	)
}

export const appendDeveloperDeclarations = (
	drafts: readonly MutableSchemaAccessPlan[],
): void => {
	for (const draft of drafts) {
		const schemaDeclarations = readSchemaDeclarations(draft.schema)

		if (schemaDeclarations !== undefined) {
			assertApplicationOwnedInlineAccess(
				draft.schemaInlineOwner,
				`${draft.schema.className}.access`,
			)
			appendSchemaDeclarations(draft, schemaDeclarations, developerAccessSource)
		}

		for (const fieldPlan of draft.fields) {
			const fieldDeclarations = readFieldDeclarations(fieldPlan.field)

			if (fieldDeclarations !== undefined) {
				assertApplicationOwnedInlineAccess(
					fieldPlan.inlineOwner,
					`${draft.schema.className}.${fieldPlan.path.join('.')}.access`,
				)
				appendFieldDeclarations(
					fieldPlan,
					fieldDeclarations,
					developerAccessSource,
				)
			}
		}
	}
}

export const finalizeSchemaPlan = (
	draft: MutableSchemaAccessPlan,
): SchemaAccessPlanLookup => {
	const fields: FieldAccessPlan[] = []
	const fieldsByPath = new Map<string, FieldAccessPlan>()
	const mutableFieldsByIdentity = new WeakMap<object, FieldAccessPlan[]>()

	for (const fieldDraft of draft.fields) {
		const fieldPlan: FieldAccessPlan = immutableRecord({
			field: fieldDraft.field,
			path: fieldDraft.path,
			read: finalizeRuleMap(fieldReadAccessChannels, fieldDraft.read),
			relationWrite: immutableArray(fieldDraft.relationWrite),
			write: finalizeRuleMap(fieldWriteAccessTransitions, fieldDraft.write),
		})

		fields.push(fieldPlan)
		fieldsByPath.set(encodeFieldPath(fieldPlan.path), fieldPlan)

		const identityPlans = mutableFieldsByIdentity.get(fieldPlan.field) ?? []

		identityPlans.push(fieldPlan)
		mutableFieldsByIdentity.set(fieldPlan.field, identityPlans)
	}

	const fieldsByIdentity = new WeakMap<object, readonly FieldAccessPlan[]>()

	for (const fieldPlan of fields) {
		const identityPlans = mutableFieldsByIdentity.get(fieldPlan.field)

		if (identityPlans !== undefined) {
			fieldsByIdentity.set(fieldPlan.field, immutableArray(identityPlans))
		}
	}

	const plan: SchemaAccessPlan = immutableRecord({
		fields: immutableArray(fields),
		filter: finalizeRuleMap(schemaFilterAccessFamilies, draft.filter),
		item: finalizeRuleMap(schemaItemAccessFamilies, draft.item),
		operation: finalizeRuleMap(accessOperationKinds, draft.operation),
		schema: draft.schema,
	})

	return { fieldsByIdentity, fieldsByPath, plan }
}

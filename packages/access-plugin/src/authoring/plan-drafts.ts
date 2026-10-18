// Mutable drafts the Access compiler fills, then freezes into the plan.
import type {
	ApplicationSchemaMutationDescriptor,
	GenericField,
	OperationKind,
	SchemaContributionOwner,
	SchemaDefinition,
} from '@ultimabase/core'
import {
	readPluginCommandOperation,
	resolveCommandKey,
} from '@ultimabase/core/plugin'
import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
} from '@ultimabase/shared'

import {
	isAccessRule,
	schemaItemAccessFamilies,
	type NormalizedAccessRule,
	type SchemaAccessDeclaration,
	type SchemaAccessDeclarations,
	type SchemaItemAccessFamily,
} from './declarations.js'
import {
	fieldReadAccessChannels,
	fieldWriteAccessTransitions,
	type FieldAccessDeclarations,
	type FieldReadAccessChannel,
	type FieldWriteAccessTransition,
} from './field-declarations.js'
import {
	accessOperationKinds,
	encodeFieldPath,
	readAccessCommandEntry,
	type AccessRuleSource,
	type CompiledAccessRule,
	type FieldAccessPlan,
	type SchemaAccessPlan,
	type SchemaMutationAccessPlan,
} from './plan.js'

/** Keys every schema accepts: `all`, groups, native operations, read methods. */
const nativeAccessKeys = [
	'all',
	'read',
	'write',
	'find',
	'findOne',
	'findMany',
	'count',
	'exists',
	...schemaItemAccessFamilies,
]

export type RuleLists<TKey extends string> = Record<TKey, CompiledAccessRule[]>

/** Collects one field's rules; frozen in place, it is the `FieldAccessPlan`. */
export interface FieldDraft extends FieldAccessPlan {
	readonly inlineOwner: SchemaContributionOwner
	readonly read: RuleLists<FieldReadAccessChannel>
	readonly relationWrite: CompiledAccessRule[]
	readonly write: RuleLists<FieldWriteAccessTransition>
}

export interface SchemaMutationDraft extends SchemaMutationAccessPlan {
	readonly item: CompiledAccessRule[]
	readonly operation: CompiledAccessRule[]
}

/** Collects one schema's rules in contribution order; frozen, it is the plan. */
export interface SchemaDraft extends SchemaAccessPlan {
	readonly fields: readonly FieldDraft[]
	readonly fieldsByPath: ReadonlyMap<string, FieldDraft>
	readonly inlineOwner: SchemaContributionOwner
	readonly item: RuleLists<SchemaItemAccessFamily>
	readonly operation: RuleLists<OperationKind>
	readonly permissions: ReadonlyMap<string, CompiledAccessRule[]>
	readonly schemaMutations: ReadonlyMap<string, SchemaMutationDraft>
}

const ruleLists = <const TKey extends string>(
	keys: readonly TKey[],
): RuleLists<TKey> =>
	// `keys` enumerates every member of TKey, so every property is present.
	Object.fromEntries(
		keys.map((key): [TKey, CompiledAccessRule[]] => [key, []]),
	) as RuleLists<TKey>

const freezeLists = (
	lists: Readonly<Record<string, CompiledAccessRule[]>>,
): void => {
	for (const list of Object.values(lists)) Object.freeze(list)
	Object.freeze(lists)
}

export const developerSource: AccessRuleSource = immutableRecord({
	kind: 'developer',
})

/** Names where one rule is declared, for denial diagnostics. */
export type RuleLocator = (path: string) => string

const push = (
	list: CompiledAccessRule[],
	rule: NormalizedAccessRule | undefined,
	source: AccessRuleSource,
	location: string,
	step: CompiledAccessRule['step'] = 'operation',
): void => {
	if (rule !== undefined) {
		list.push(immutableRecord({ location, rule, source, step }))
	}
}

/**
 * Places one declaration in the plan (ADR-0347): each native terminal and
 * each request command takes the rule of its most precise key (method,
 * operation, group, then `all`), and a permission only its own key. Item
 * checks come from the deciding operation key, the only one that takes
 * `{ where, item }`.
 */
export const appendSchemaDeclarations = (
	draft: SchemaDraft,
	declarations: SchemaAccessDeclarations,
	source: AccessRuleSource,
	locate: RuleLocator,
): void => {
	const pushOperation = (
		list: CompiledAccessRule[],
		declaration: SchemaAccessDeclaration | undefined,
	): void => {
		if (declaration === undefined) return
		const { operation } = declaration
		push(list, operation.rule, source, locate(operation.path), operation.step)
	}
	for (const kind of accessOperationKinds) {
		pushOperation(
			draft.operation[kind],
			resolveCommandKey(declarations, readAccessCommandEntry(kind)),
		)
	}
	for (const family of schemaItemAccessFamilies) {
		const declaration = Object.hasOwn(declarations, family)
			? declarations[family]
			: undefined
		push(draft.item[family], declaration?.item, source, locate(`${family}.item`))
	}
	const known = new Set(nativeAccessKeys)
	for (const mutation of draft.schemaMutations.values()) {
		if (mutation.descriptor.mutation.authority !== 'request') continue
		const { entry } = mutation
		known.add(entry.operation)
		const declaration = resolveCommandKey(declarations, entry)
		pushOperation(mutation.operation, declaration)
		if (declaration?.item !== undefined) {
			push(
				mutation.item,
				declaration.item,
				source,
				locate(`${entry.operation}.item`),
			)
		}
	}
	for (const [permission, rules] of draft.permissions) {
		if (!Object.hasOwn(declarations, permission)) continue
		known.add(permission)
		const declaration = declarations[permission]
		if (declaration?.item !== undefined) {
			throw new TypeError(
				`access.${permission} is a permission: use true, false or a predicate`,
			)
		}
		pushOperation(rules, declaration)
	}
	for (const key of Object.keys(declarations)) {
		if (!known.has(key)) assertKnownSchemaKey(draft, key)
	}
}

/** Explains why `key` names no operation, read method or permission. */
const assertKnownSchemaKey = (draft: SchemaDraft, key: string): void => {
	const named = [...draft.schemaMutations.values()].find(
		({ descriptor, entry }) =>
			descriptor.command === key || entry.operation === key,
	)
	if (named !== undefined && named.descriptor.mutation.authority !== 'request') {
		throw new TypeError(
			`Unknown request schema mutation Access branch: access.${key}`,
		)
	}
	if (named !== undefined) {
		throw new TypeError(
			`access.${key} names a write method: use its operation ${named.entry.operation}`,
		)
	}
	throw new TypeError(
		`Unknown Access rule: access.${key} is neither a request command nor a permission of ${draft.schema.className}`,
	)
}

const publicReadChannels: Readonly<Record<FieldReadAccessChannel, string>> =
	immutableRecord({ filter: 'where', item: 'output', order: 'orderBy' })

export const appendFieldDeclarations = (
	draft: FieldDraft,
	declarations: FieldAccessDeclarations,
	source: AccessRuleSource,
	locate: RuleLocator,
): void => {
	const read = declarations.read
	if (read !== undefined) {
		for (const channel of fieldReadAccessChannels) {
			push(
				draft.read[channel],
				isAccessRule(read) ? read : read[channel],
				source,
				locate(`read.${publicReadChannels[channel]}`),
			)
		}
	}
	for (const transition of fieldWriteAccessTransitions) {
		push(
			draft.write[transition],
			declarations.write?.[transition],
			source,
			locate(`write.${transition}`),
		)
	}
	push(draft.relationWrite, declarations.relationWrite, source, locate('write'))
}

/** Lists one field and its nested object fields in parent-first order. */
const collectFieldDrafts = (
	name: string,
	field: GenericField,
	inlineOwner: SchemaContributionOwner,
	parent: readonly string[] = [],
): FieldDraft[] => {
	const path = immutableArray([...parent, name])
	const nested: unknown = Reflect.get(field.options, 'fields')
	const draft: FieldDraft = {
		field,
		inlineOwner,
		path,
		read: ruleLists(fieldReadAccessChannels),
		relationWrite: [],
		write: ruleLists(fieldWriteAccessTransitions),
	}
	if (field.kind !== 'object' || !isPlainRecord(nested)) return [draft]

	// Object fields keep their nested definitions in this exact option shape.
	const fields = nested as Readonly<Record<string, GenericField>>
	return [
		draft,
		...Object.entries(fields).flatMap(([childName, child]) =>
			collectFieldDrafts(childName, child, inlineOwner, path),
		),
	]
}

export const createSchemaDraft = (
	schema: SchemaDefinition,
	mutations: readonly ApplicationSchemaMutationDescriptor[],
	permissions: readonly string[],
): SchemaDraft => {
	const { provenance } = schema
	const fields = Object.entries(schema.fields).flatMap(([name, field]) =>
		collectFieldDrafts(
			name,
			field,
			provenance.fieldOptions[name]?.access?.value.owner ??
				provenance.fields[name]?.owner ??
				provenance.schema.owner,
		),
	)
	return {
		fields,
		fieldsByPath: new Map(
			fields.map((field) => [encodeFieldPath(field.path), field]),
		),
		inlineOwner:
			provenance.options.access?.value.owner ?? provenance.schema.owner,
		item: ruleLists(schemaItemAccessFamilies),
		operation: ruleLists(accessOperationKinds),
		permissions: new Map(permissions.map((permission) => [permission, []])),
		schema,
		schemaMutations: new Map(
			mutations.map((descriptor) => [
				descriptor.command,
				{
					descriptor,
					entry: immutableRecord({
						group: 'write' as const,
						method: descriptor.command,
						operation: readPluginCommandOperation(
							descriptor.command,
							descriptor.mutation.target,
						),
					}),
					item: [],
					operation: [],
				},
			]),
		),
	}
}

/** Freezes every collected list and record in place, deepest first. */
export const freezeSchemaDraft = (
	draft: SchemaDraft,
): Readonly<SchemaDraft> => {
	for (const field of draft.fields) {
		freezeLists(field.read)
		Object.freeze(field.relationWrite)
		freezeLists(field.write)
		Object.freeze(field)
	}
	for (const mutation of draft.schemaMutations.values()) {
		Object.freeze(mutation.item)
		Object.freeze(mutation.operation)
		Object.freeze(mutation)
	}
	for (const rules of draft.permissions.values()) Object.freeze(rules)
	freezeLists(draft.item)
	freezeLists(draft.operation)
	return Object.freeze(draft)
}

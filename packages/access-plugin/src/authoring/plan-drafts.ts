// Mutable drafts the Access compiler fills, then freezes into the plan.
import type {
	ApplicationSchemaMutationDescriptor,
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

import {
	isAccessRule,
	schemaItemAccessFamilies,
	type NormalizedAccessRule,
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
	readAccessOperationSlot,
	type AccessRuleSource,
	type CompiledAccessRule,
	type FieldAccessPlan,
	type SchemaAccessPlan,
	type SchemaMutationAccessPlan,
} from './plan.js'

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

export const appendSchemaDeclarations = (
	draft: SchemaDraft,
	declarations: SchemaAccessDeclarations,
	source: AccessRuleSource,
	locate: RuleLocator,
): void => {
	for (const kind of accessOperationKinds) {
		const rule = declarations.operation?.[readAccessOperationSlot(kind)]
		if (rule === undefined) continue
		push(draft.operation[kind], rule.rule, source, locate(rule.path), rule.step)
	}
	for (const family of schemaItemAccessFamilies) {
		push(
			draft.item[family],
			declarations.item?.[family],
			source,
			locate(`${family}.item`),
		)
	}
	for (const [key, rules] of Object.entries(declarations.extensions ?? {})) {
		const { operation } = rules
		const mutation = draft.schemaMutations.get(key)
		const permission = draft.permissions.get(key)
		if (mutation !== undefined) {
			if (mutation.descriptor.mutation.authority !== 'request') {
				throw new TypeError(
					`Unknown request schema mutation Access branch: access.${key}`,
				)
			}
			push(
				mutation.operation,
				operation.rule,
				source,
				locate(operation.path),
				operation.step,
			)
			push(mutation.item, rules.item, source, locate(`${key}.item`))
		} else if (permission !== undefined) {
			if (rules.item !== undefined) {
				throw new TypeError(
					`access.${key} is a permission: use true, false or a predicate`,
				)
			}
			push(permission, operation.rule, source, locate(operation.path))
		} else {
			throw new TypeError(
				`Unknown Access rule: access.${key} is neither a request command nor a permission of ${draft.schema.className}`,
			)
		}
	}
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
				{ descriptor, item: [], operation: [] },
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

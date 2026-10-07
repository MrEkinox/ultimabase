import type {
	ApplicationSchemaMutationDescriptor,
	ApplicationSchemaMutationSurface,
	CompiledSchemaRegistry,
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

import type { OwnedAccessContribution } from '../contributions.js'
import { readFieldKindAccessTarget } from '../targets.js'
import {
	isAccessRule,
	schemaFilterAccessFamilies,
	schemaItemAccessFamilies,
	type NormalizedAccessRule,
	type SchemaAccessDeclarations,
	type SchemaFilterAccessFamily,
	type SchemaItemAccessFamily,
} from './declarations.js'
import {
	fieldReadAccessChannels,
	fieldWriteAccessTransitions,
	normalizeFieldAccessDeclarations,
	type FieldAccessDeclarations,
	type FieldReadAccessChannel,
	type FieldWriteAccessTransition,
} from './field-declarations.js'
import {
	accessOperationKinds,
	encodeFieldPath,
	isReadAccessSlot,
	readAccessOperationSlot,
	type AccessDefaultPolicy,
	type AccessPlan,
	type AccessRuleSource,
	type CompiledAccessRule,
	type FieldAccessPlan,
	type SchemaAccessPlan,
	type SchemaMutationAccessPlan,
} from './plan.js'

type RuleLists<TKey extends string> = Record<TKey, CompiledAccessRule[]>

/** Collects one field's rules; frozen in place, it is the `FieldAccessPlan`. */
interface FieldDraft extends FieldAccessPlan {
	readonly inlineOwner: SchemaContributionOwner
	readonly read: RuleLists<FieldReadAccessChannel>
	readonly relationWrite: CompiledAccessRule[]
	readonly write: RuleLists<FieldWriteAccessTransition>
}

interface SchemaMutationDraft extends SchemaMutationAccessPlan {
	readonly filter: CompiledAccessRule[]
	readonly item: CompiledAccessRule[]
	readonly operation: CompiledAccessRule[]
}

/** Collects one schema's rules in contribution order; frozen, it is the plan. */
interface SchemaDraft extends SchemaAccessPlan {
	readonly fields: readonly FieldDraft[]
	readonly fieldsByPath: ReadonlyMap<string, FieldDraft>
	readonly filter: RuleLists<SchemaFilterAccessFamily>
	readonly inlineOwner: SchemaContributionOwner
	readonly item: RuleLists<SchemaItemAccessFamily>
	readonly operation: RuleLists<OperationKind>
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

const developerSource: AccessRuleSource = immutableRecord({
	kind: 'developer',
})

const push = (
	list: CompiledAccessRule[],
	rule: NormalizedAccessRule | undefined,
	source: AccessRuleSource,
): void => {
	if (rule !== undefined) list.push(immutableRecord({ rule, source }))
}

const appendSchemaDeclarations = (
	draft: SchemaDraft,
	declarations: SchemaAccessDeclarations,
	source: AccessRuleSource,
): void => {
	const operation = declarations.operation
	if (operation !== undefined) {
		for (const kind of accessOperationKinds) {
			const slot = readAccessOperationSlot(kind)
			const read = operation.read
			const rule = !isReadAccessSlot(slot)
				? operation[slot]
				: read === undefined || isAccessRule(read)
					? read
					: read[slot]
			push(draft.operation[kind], rule, source)
		}
	}
	for (const family of schemaFilterAccessFamilies) {
		push(draft.filter[family], declarations.filter?.[family], source)
	}
	for (const family of schemaItemAccessFamilies) {
		push(draft.item[family], declarations.item?.[family], source)
	}
	for (const [command, rules] of Object.entries(declarations.mutations ?? {})) {
		const mutation = draft.schemaMutations.get(command)
		if (mutation?.descriptor.mutation.authority !== 'request') {
			throw new TypeError(
				`Unknown request schema mutation Access branch: access.${command}`,
			)
		}
		push(mutation.operation, rules.operation, source)
		push(mutation.filter, rules.filter, source)
		push(mutation.item, rules.item, source)
	}
}

const appendFieldDeclarations = (
	draft: FieldDraft,
	declarations: FieldAccessDeclarations,
	source: AccessRuleSource,
): void => {
	const read = declarations.read
	if (read !== undefined) {
		for (const channel of fieldReadAccessChannels) {
			const rule = isAccessRule(read) ? read : read[channel]
			draft.read[channel].push(immutableRecord({ rule, source }))
		}
	}
	const write = declarations.write
	if (write !== undefined) {
		for (const transition of fieldWriteAccessTransitions) {
			draft.write[transition].push(
				immutableRecord({ rule: write[transition], source }),
			)
		}
	}
	push(draft.relationWrite, declarations.relationWrite, source)
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

const createSchemaDraft = (
	schema: SchemaDefinition,
	mutations: readonly ApplicationSchemaMutationDescriptor[] = [],
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
		filter: ruleLists(schemaFilterAccessFamilies),
		inlineOwner:
			provenance.options.access?.value.owner ?? provenance.schema.owner,
		item: ruleLists(schemaItemAccessFamilies),
		operation: ruleLists(accessOperationKinds),
		schema,
		schemaMutations: new Map(
			mutations.map((descriptor) => [
				descriptor.command,
				{ descriptor, filter: [], item: [], operation: [] },
			]),
		),
	}
}

const applyPluginContributions = (
	drafts: readonly SchemaDraft[],
	contributions: readonly OwnedAccessContribution[],
): void => {
	const draftsBySchema = new Map(drafts.map((draft) => [draft.schema, draft]))

	for (const { contributionId, definition, owner } of contributions) {
		const source: AccessRuleSource = immutableRecord({
			kind: 'plugin' as const,
			localName: contributionId,
			ownerPlugin: owner.pluginId,
			...(owner.instanceId === undefined
				? {}
				: { ownerInstanceId: owner.instanceId }),
			targetKind: definition.targetKind,
		})

		if (definition.targetKind === 'field-kind') {
			const kind = readFieldKindAccessTarget(definition.target)
			for (const draft of drafts) {
				for (const field of draft.fields) {
					if (field.field.kind !== kind) continue
					const declarations = normalizeFieldAccessDeclarations(
						// The erased factory accepts the context of its own target kind.
						definition.create({
							field: field.field,
							path: field.path,
							schema: draft.schema,
						} as never),
					)
					if (declarations === undefined) {
						throw new TypeError(
							`Access contribution "${contributionId}" must declare a field rule`,
						)
					}
					appendFieldDeclarations(field, declarations, source)
				}
			}
			continue
		}
		if (definition.targetKind === 'global') {
			for (const draft of drafts) {
				appendSchemaDeclarations(draft, definition.declarations, source)
			}
			continue
		}

		const draft = draftsBySchema.get(definition.schema)
		if (draft === undefined) {
			throw new TypeError(
				`Access contribution "${contributionId}" targets a schema outside its application`,
			)
		}
		if (definition.targetKind === 'schema') {
			appendSchemaDeclarations(draft, definition.declarations, source)
			continue
		}
		const field = draft.fieldsByPath.get(encodeFieldPath(definition.path))
		if (field?.field !== definition.field) {
			throw new TypeError(
				`Access contribution "${contributionId}" targets an unavailable field`,
			)
		}
		appendFieldDeclarations(field, definition.declarations, source)
	}
}

/** Rejects inline policy that a plugin injected into application options. */
const assertApplicationOwnedInlineAccess = (
	owner: SchemaContributionOwner,
	path: string,
): void => {
	if (owner.kind === 'application') return
	throw new TypeError(
		`Inline Access at ${path} is owned by ${owner.kind === 'plugin' ? owner.pluginId : owner.kind}; plugins must use provideAccessContributions()`,
	)
}

// Inline options were normalized by the option definitions in `options.ts`.
const readInlineAccess = (options: object): unknown =>
	Object.hasOwn(options, 'access') ? Reflect.get(options, 'access') : undefined

const appendDeveloperDeclarations = (drafts: readonly SchemaDraft[]): void => {
	for (const draft of drafts) {
		const className = draft.schema.className
		const schemaAccess = readInlineAccess(draft.schema.definition) as
			SchemaAccessDeclarations | undefined
		if (schemaAccess !== undefined) {
			assertApplicationOwnedInlineAccess(
				draft.inlineOwner,
				`${className}.access`,
			)
			appendSchemaDeclarations(draft, schemaAccess, developerSource)
		}

		for (const field of draft.fields) {
			const fieldAccess = readInlineAccess(field.field.options) as
				FieldAccessDeclarations | undefined
			if (fieldAccess !== undefined) {
				assertApplicationOwnedInlineAccess(
					field.inlineOwner,
					`${className}.${field.path.join('.')}.access`,
				)
				appendFieldDeclarations(field, fieldAccess, developerSource)
			}
		}
	}
}

/** Freezes every collected list and record in place, deepest first. */
const freezeSchemaDraft = (draft: SchemaDraft): Readonly<SchemaDraft> => {
	for (const field of draft.fields) {
		freezeLists(field.read)
		Object.freeze(field.relationWrite)
		freezeLists(field.write)
		Object.freeze(field)
	}
	for (const mutation of draft.schemaMutations.values()) {
		Object.freeze(mutation.filter)
		Object.freeze(mutation.item)
		Object.freeze(mutation.operation)
		Object.freeze(mutation)
	}
	freezeLists(draft.filter)
	freezeLists(draft.item)
	freezeLists(draft.operation)
	return Object.freeze(draft)
}

/** Compiles application and provider declarations into one immutable plan. */
export const compileAccessPlan = (
	registry: CompiledSchemaRegistry,
	defaults: AccessDefaultPolicy,
	contributions: readonly OwnedAccessContribution[] = [],
	mutationSurface?: ApplicationSchemaMutationSurface,
): AccessPlan => {
	const drafts = registry
		.values()
		.map((schema) => createSchemaDraft(schema, mutationSurface?.get(schema)))
	// Provider rules precede developer rules in every compiled list.
	applyPluginContributions(drafts, contributions)
	appendDeveloperDeclarations(drafts)
	const plans = new WeakMap(
		drafts.map((draft) => [draft.schema, freezeSchemaDraft(draft)]),
	)

	return immutableRecord({
		defaults,
		getField: (schema, path) =>
			plans.get(schema)?.fieldsByPath.get(encodeFieldPath(path)),
		getFields: (schema, field) =>
			immutableArray(
				plans.get(schema)?.fields.filter((plan) => plan.field === field) ?? [],
			),
		getSchema: (schema) => plans.get(schema),
	})
}

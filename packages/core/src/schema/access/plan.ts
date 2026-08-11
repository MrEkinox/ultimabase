import { immutableArray, immutableRecord } from '@ultimabase/shared'

import type {
	FrameworkAccessDefaultPolicy,
	FrameworkApplication,
} from '../../application/framework-application.js'
import type { PluginDefinition } from '../../plugins/definition.js'
import { readApplicationAccessContributions } from '../../plugins/setup-registries.js'
import {
	getResolvedPluginAccessContribution,
	type PluginAccessMasterBehavior,
	type PluginAccessTargetKind,
} from '../../plugins/access-targets.js'
import type { OperationKind } from '../../query/index.js'
import type { GenericField } from '../fields/base/contract.js'
import { getFieldAccessDeclarations } from '../fields/base/definition.js'
import { collectFieldTraversalEntries } from '../fields/traversal.js'
import type { SchemaDefinition } from '../schema/definition.js'
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
	getSchemaAccessDeclarations,
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
	readonly master: PluginAccessMasterBehavior
	readonly ownerPlugin: string
	readonly ownerInstanceId?: string
	readonly targetKind: PluginAccessTargetKind
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
	readonly defaults: FrameworkAccessDefaultPolicy
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

type MutableAccessRuleMap<TKey extends string> = Record<
	TKey,
	CompiledAccessRule[]
>

interface MutableFieldAccessPlan {
	readonly field: GenericField
	readonly path: readonly string[]
	readonly read: MutableAccessRuleMap<FieldReadAccessChannel>
	readonly relationWrite: CompiledAccessRule[]
	readonly write: MutableAccessRuleMap<FieldWriteAccessTransition>
}

interface MutableSchemaAccessPlan {
	readonly fields: readonly MutableFieldAccessPlan[]
	readonly fieldsByPath: ReadonlyMap<string, MutableFieldAccessPlan>
	readonly filter: MutableAccessRuleMap<SchemaFilterAccessFamily>
	readonly item: MutableAccessRuleMap<SchemaItemAccessFamily>
	readonly operation: MutableAccessRuleMap<OperationKind>
	readonly schema: SchemaDefinition
}

interface SchemaAccessPlanLookup {
	readonly fieldsByIdentity: WeakMap<object, readonly FieldAccessPlan[]>
	readonly fieldsByPath: ReadonlyMap<string, FieldAccessPlan>
	readonly plan: SchemaAccessPlan
}

const developerAccessSource: DeveloperAccessSource = immutableRecord({
	kind: 'developer',
	master: 'enforce',
})
const emptyFieldAccessPlans: readonly FieldAccessPlan[] = immutableArray([])
const accessPlansByApplication = new WeakMap<object, AccessPlan>()

/** Encodes field segments without assigning syntax to developer characters. */
const encodeFieldPath = (path: readonly string[]): string =>
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

const appendSchemaDeclarations = (
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

const appendFieldDeclarations = (
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

const createMutableSchemaPlan = (
	schema: SchemaDefinition,
): MutableSchemaAccessPlan => {
	const fields = collectFieldTraversalEntries(schema.fields).map(
		({ field, path }): MutableFieldAccessPlan => ({
			field,
			path,
			read: createMutableRuleMap(fieldReadAccessChannels),
			relationWrite: [],
			write: createMutableRuleMap(fieldWriteAccessTransitions),
		}),
	)
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
	}
}

const createPluginSource = (
	resolved: NonNullable<ReturnType<typeof getResolvedPluginAccessContribution>>,
): PluginAccessSource =>
	immutableRecord({
		kind: 'plugin',
		localName: resolved.localName,
		master: resolved.master,
		ownerPlugin: resolved.ownerPlugin,
		...(resolved.ownerInstanceId === undefined
			? {}
			: { ownerInstanceId: resolved.ownerInstanceId }),
		targetKind: resolved.targetKind,
	})

const appendPluginContributions = (
	application: FrameworkApplication<
		readonly SchemaDefinition[],
		readonly PluginDefinition[]
	>,
	plansBySchema: WeakMap<object, MutableSchemaAccessPlan>,
): void => {
	for (const contribution of readApplicationAccessContributions(application)) {
		const resolved = getResolvedPluginAccessContribution(contribution.value)

		if (resolved === undefined) {
			throw new TypeError(
				`Plugin Access contribution "${contribution.name}" was not resolved`,
			)
		}

		const source = createPluginSource(resolved)

		for (const match of resolved.schemas) {
			const plan = plansBySchema.get(match.schema)

			if (plan === undefined) {
				throw new TypeError(
					`Plugin Access contribution "${resolved.localName}" resolved outside its application`,
				)
			}

			appendSchemaDeclarations(plan, match.declarations, source)
		}

		for (const match of resolved.fields) {
			const schemaPlan = plansBySchema.get(match.schema)
			const fieldPlan = schemaPlan?.fieldsByPath.get(
				encodeFieldPath(match.path),
			)

			if (fieldPlan?.field !== match.field) {
				throw new TypeError(
					`Plugin Access contribution "${resolved.localName}" resolved an inconsistent field target`,
				)
			}

			appendFieldDeclarations(fieldPlan, match.declarations, source)
		}
	}
}

const appendDeveloperDeclarations = (
	drafts: readonly MutableSchemaAccessPlan[],
): void => {
	for (const draft of drafts) {
		const schemaDeclarations = getSchemaAccessDeclarations(draft.schema)

		if (schemaDeclarations !== undefined) {
			appendSchemaDeclarations(draft, schemaDeclarations, developerAccessSource)
		}

		for (const fieldPlan of draft.fields) {
			const fieldDeclarations = getFieldAccessDeclarations(fieldPlan.field)

			if (fieldDeclarations !== undefined) {
				appendFieldDeclarations(
					fieldPlan,
					fieldDeclarations,
					developerAccessSource,
				)
			}
		}
	}
}

const finalizeSchemaPlan = (
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

/** Compiles declarations and resolved provider policies exactly once per app. */
export const compileApplicationAccessPlan = <
	const TSchemas extends readonly SchemaDefinition[],
	const TPlugins extends readonly PluginDefinition[],
>(
	application: FrameworkApplication<TSchemas, TPlugins>,
): AccessPlan => {
	const existingPlan = accessPlansByApplication.get(application)

	if (existingPlan !== undefined) {
		return existingPlan
	}

	const drafts = application.schemas.values().map(createMutableSchemaPlan)
	const draftsBySchema = new WeakMap<object, MutableSchemaAccessPlan>()

	for (const draft of drafts) {
		draftsBySchema.set(draft.schema, draft)
	}

	appendPluginContributions(application, draftsBySchema)
	appendDeveloperDeclarations(drafts)

	const schemas: SchemaAccessPlan[] = []
	const lookupsBySchema = new WeakMap<object, SchemaAccessPlanLookup>()

	for (const draft of drafts) {
		const lookup = finalizeSchemaPlan(draft)

		schemas.push(lookup.plan)
		lookupsBySchema.set(draft.schema, lookup)
	}

	const plan: AccessPlan = immutableRecord({
		defaults: application.accessDefaults,
		getField: (schema, path) =>
			lookupsBySchema.get(schema)?.fieldsByPath.get(encodeFieldPath(path)),
		getFields: (schema, field) =>
			lookupsBySchema.get(schema)?.fieldsByIdentity.get(field) ??
			emptyFieldAccessPlans,
		getSchema: (schema) => lookupsBySchema.get(schema)?.plan,
		schemas: immutableArray(schemas),
	})

	accessPlansByApplication.set(application, plan)

	return plan
}

/** Reads the plan produced during setup without compiling request-time state. */
export const getApplicationAccessPlan = (application: object): AccessPlan => {
	const plan = accessPlansByApplication.get(application)

	if (plan === undefined) {
		throw new TypeError('Application Access plan is not compiled')
	}

	return plan
}

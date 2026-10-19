import type {
	ApplicationSchemaMutationDescriptor,
	ApplicationSchemaMutationSurface,
	CompiledSchemaRegistry,
	GenericField,
	SchemaContributionOwner,
	SchemaDefinition,
} from '@ultimabase/core'
import { readPluginCommandOperation } from '@ultimabase/core/plugin'
import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
} from '@ultimabase/shared'

import type {
	FieldHookDeclarations,
	SchemaHookDeclarations,
} from '../authoring/declarations.js'
import type {
	HookContributionTargetKind,
	OwnedHookContribution,
} from '../contributions.js'

interface PluginHookContribution<TDeclarations extends object> {
	readonly declarations: TDeclarations
	readonly kind: 'plugin'
	readonly localName: string
	readonly ownerPlugin: string
	readonly ownerInstanceId?: string
	readonly targetKind: HookContributionTargetKind
}

export type HookContribution<TDeclarations extends object> =
	| Readonly<{ declarations: TDeclarations; kind: 'developer' }>
	| Readonly<{ declarations: TDeclarations; kind: 'global' }>
	| PluginHookContribution<TDeclarations>

/**
 * Before order lists plugins in graph order, then the application's global
 * hooks, then the schema's own declaration.
 */
export interface HookContributionNesting<TDeclarations extends object> {
	/** Unwinds the exact before nesting, retaining each owner. */
	readonly after: readonly HookContribution<TDeclarations>[]
	readonly before: readonly HookContribution<TDeclarations>[]
}

export interface FieldHookContributionPlan {
	readonly contributions: HookContributionNesting<FieldHookDeclarations>
	readonly field: GenericField
	readonly path: readonly string[]
}

export interface SchemaHookContributionPlan {
	readonly contributions: HookContributionNesting<SchemaHookDeclarations>
	readonly schema: SchemaDefinition
	readonly schemaMutations: ReadonlyMap<
		string,
		ApplicationSchemaMutationDescriptor
	>
}

export interface HookContributionPlan {
	readonly schemas: readonly SchemaHookContributionPlan[]
	getField(
		schema: SchemaDefinition,
		path: readonly string[],
	): FieldHookContributionPlan | undefined
	getSchema(schema: SchemaDefinition): SchemaHookContributionPlan | undefined
}

interface FieldDraft {
	readonly field: GenericField
	readonly inlineOwner: SchemaContributionOwner
	readonly path: readonly string[]
	readonly plugins: PluginHookContribution<FieldHookDeclarations>[]
}

interface SchemaDraft {
	readonly fields: ReadonlyMap<string, FieldDraft>
	readonly plugins: PluginHookContribution<SchemaHookDeclarations>[]
	readonly schema: SchemaDefinition
	readonly schemaMutations: SchemaHookContributionPlan['schemaMutations']
}

// Length-prefixed segments keep listed paths, dotted names and system fields distinct.
const encodeFieldPath = (path: readonly string[]): string =>
	path.map((segment) => `${String(segment.length)}:${segment}`).join('')

/** Prevents plugin-owned option values from bypassing capability privilege checks. */
const assertApplicationOwnedInlineHooks = (
	owner: SchemaContributionOwner,
	path: string,
): void => {
	if (owner.kind === 'application') return
	const name =
		owner.kind === 'plugin'
			? `${owner.pluginId}${owner.instanceId === undefined ? '' : `#${owner.instanceId}`}`
			: owner.kind
	throw new TypeError(
		`Inline Hooks at ${path} are owned by ${name}; plugins must use provideHookContributions()`,
	)
}

// The official option normalizers are the only writers of an inline `hooks` value.
const readInlineHooks = (source: object): unknown =>
	Object.hasOwn(source, 'hooks') ? Reflect.get(source, 'hooks') : undefined

/** Indexes every stored and recursively embedded field by its exact path. */
const collectFields = (
	fields: Readonly<Record<string, GenericField>>,
	owner: (name: string) => SchemaContributionOwner,
	parent: readonly string[],
	into: Map<string, FieldDraft>,
): void => {
	for (const [name, field] of Object.entries(fields)) {
		const path = immutableArray([...parent, name])
		const inlineOwner = owner(name)
		into.set(encodeFieldPath(path), { field, inlineOwner, path, plugins: [] })
		const nested: unknown = Reflect.get(field.options, 'fields')
		if (field.kind === 'object' && isPlainRecord(nested)) {
			// Embedded object fields store their compiled child field definitions.
			const children = nested as Readonly<Record<string, GenericField>>
			collectFields(children, () => inlineOwner, path, into)
		}
	}
}

const createSchemaDraft = (
	schema: SchemaDefinition,
	mutations: readonly ApplicationSchemaMutationDescriptor[] = [],
): SchemaDraft => {
	const fields = new Map<string, FieldDraft>()
	const { provenance } = schema
	collectFields(
		schema.fields,
		(name) =>
			provenance.fieldOptions[name]?.hooks?.value.owner ??
			provenance.fields[name]?.owner ??
			provenance.schema.owner,
		[],
		fields,
	)
	return {
		fields,
		plugins: [],
		schema,
		schemaMutations: new Map(
			mutations.map((descriptor) => [descriptor.command, descriptor]),
		),
	}
}

const createPluginContribution = <TDeclarations extends object>(
	owned: OwnedHookContribution,
	declarations: TDeclarations,
): PluginHookContribution<TDeclarations> =>
	immutableRecord({
		declarations,
		kind: 'plugin' as const,
		localName: owned.contributionId,
		ownerPlugin: owned.owner.pluginId,
		...(owned.owner.instanceId === undefined
			? {}
			: { ownerInstanceId: owned.owner.instanceId }),
		targetKind: owned.definition.targetKind,
	})

const applyPluginContributions = (
	drafts: readonly SchemaDraft[],
	contributions: readonly OwnedHookContribution[],
): void => {
	const draftsBySchema = new Map(drafts.map((draft) => [draft.schema, draft]))

	for (const owned of contributions) {
		const { definition } = owned
		if (definition.targetKind === 'global') {
			for (const draft of drafts) {
				draft.plugins.push(
					createPluginContribution(owned, definition.declarations),
				)
			}
			continue
		}

		const draft = draftsBySchema.get(definition.schema)
		if (draft === undefined) {
			throw new TypeError(
				`Hook contribution "${owned.contributionId}" targets a schema outside its application`,
			)
		}
		if (definition.targetKind === 'schema') {
			draft.plugins.push(
				createPluginContribution(owned, definition.declarations),
			)
			continue
		}

		const field = draft.fields.get(encodeFieldPath(definition.path))
		if (field?.field !== definition.field) {
			throw new TypeError(
				`Hook contribution "${owned.contributionId}" resolved an inconsistent field target`,
			)
		}
		field.plugins.push(createPluginContribution(owned, definition.declarations))
	}
}

const nestContributions = <TDeclarations extends object>(
	plugins: readonly HookContribution<TDeclarations>[],
	developer: TDeclarations | undefined,
	global?: TDeclarations,
): HookContributionNesting<TDeclarations> => {
	const before: HookContribution<TDeclarations>[] = [...plugins]
	if (global !== undefined) {
		before.push(
			immutableRecord({ declarations: global, kind: 'global' as const }),
		)
	}
	if (developer !== undefined) {
		before.push(
			immutableRecord({ declarations: developer, kind: 'developer' as const }),
		)
	}
	return immutableRecord({
		after: immutableArray(before.toReversed()),
		before: immutableArray(before),
	})
}

/**
 * Lists the commands each plugin operation of one schema covers, the `One`
 * method first: `softDelete` covers `softDeleteOne` and `softDeleteMany`.
 */
const readPluginOperations = (
	schemaMutations: SchemaHookContributionPlan['schemaMutations'],
): ReadonlyMap<string, readonly string[]> => {
	const operations = new Map<string, readonly string[]>()
	for (const { command, mutation } of schemaMutations.values()) {
		const operation = readPluginCommandOperation(command, mutation.target)
		const commands = operations.get(operation) ?? []
		operations.set(
			operation,
			mutation.target === 'one'
				? [command, ...commands]
				: [...commands, command],
		)
	}
	return operations
}

const finalizeSchemaPlan = (
	draft: SchemaDraft,
	global: SchemaHookDeclarations | undefined,
) => {
	const { schema, schemaMutations } = draft
	const fields = new Map<string, FieldHookContributionPlan>()

	for (const [key, candidate] of draft.fields) {
		// Inline field values are written only by the field `hooks` option normalizer.
		const developer = readInlineHooks(candidate.field.options) as
			FieldHookDeclarations | undefined
		if (developer === undefined && candidate.plugins.length === 0) continue
		if (developer !== undefined) {
			assertApplicationOwnedInlineHooks(
				candidate.inlineOwner,
				`${schema.className}.fields.${candidate.path.join('.')}.hooks`,
			)
		}
		fields.set(
			key,
			immutableRecord({
				contributions: nestContributions(candidate.plugins, developer),
				field: candidate.field,
				path: candidate.path,
			}),
		)
	}

	// Inline schema values are written only by the schema `hooks` option normalizer.
	const developer = readInlineHooks(schema.definition) as
		SchemaHookDeclarations | undefined
	if (developer !== undefined) {
		assertApplicationOwnedInlineHooks(
			schema.provenance.options.hooks?.value.owner ??
				schema.provenance.schema.owner,
			`${schema.className}.hooks`,
		)
	}
	const contributions = nestContributions(draft.plugins, developer, global)

	// Stale or per-method branches fail at startup, before Runtime work begins.
	const operations = readPluginOperations(schemaMutations)
	for (const { declarations } of contributions.before) {
		for (const [branch, groups] of Object.entries(
			declarations.mutations ?? {},
		)) {
			if (operations.has(branch)) continue
			const group =
				groups.beforeOperation !== undefined
					? 'beforeOperation'
					: groups.afterOperation !== undefined
						? 'afterOperation'
						: 'afterCommit'
			const method = schemaMutations.get(branch)
			if (method !== undefined) {
				const operation = readPluginCommandOperation(
					branch,
					method.mutation.target,
				)
				throw new TypeError(
					`Hook branch ${schema.className}.hooks.${group}.${branch} names the method ${branch}: Hooks take its operation ${operation}, which covers ${(operations.get(operation) ?? []).join(' and ')}`,
				)
			}
			throw new TypeError(
				`Unknown schema mutation Hook branch: ${schema.className}.hooks.${group}.${branch}`,
			)
		}
	}

	return {
		fields,
		plan: immutableRecord({ contributions, schema, schemaMutations }),
	}
}

/** Compiles normalized inline and compatible-plugin declarations once per application. */
export const compileHookContributionPlan = (
	schemas: CompiledSchemaRegistry,
	contributions: readonly OwnedHookContribution[],
	mutationSurface?: ApplicationSchemaMutationSurface,
	global?: SchemaHookDeclarations,
): HookContributionPlan => {
	const drafts = schemas
		.values()
		.map((schema) => createSchemaDraft(schema, mutationSurface?.get(schema)))
	applyPluginContributions(drafts, contributions)
	const plans = new Map(
		drafts.map((draft) => [draft.schema, finalizeSchemaPlan(draft, global)]),
	)

	return immutableRecord({
		schemas: immutableArray(Array.from(plans.values(), ({ plan }) => plan)),
		getField: (schema, path) =>
			plans.get(schema)?.fields.get(encodeFieldPath(path)),
		getSchema: (schema) => plans.get(schema)?.plan,
	})
}

import {
	FrameworkApplication,
	type PluginDefinition,
} from '../../foundation.js'
import {
	getResolvedPluginHookContribution,
	type PluginHookTargetKind,
} from '../../plugins/hook-targets.js'
import type { GenericField } from '../../schema/fields/base/contract.js'
import { getFieldHookDeclarations } from '../../schema/fields/base/definition.js'
import { collectFieldTraversalEntries } from '../../schema/fields/traversal.js'
import type { FieldHookDeclarations } from '../../schema/hooks/field-declarations.js'
import {
	getSchemaHookDeclarations,
	type SchemaHookDeclarations,
} from '../../schema/hooks/declarations.js'
import type { SchemaDefinition } from '../../schema/index.js'
import { immutableArray, immutableRecord } from '@ultimabase/shared'

/** Identifies one developer declaration retained behind its schema identity. */
export interface DeveloperHookContribution<TDeclarations extends object> {
	readonly declarations: TDeclarations
	readonly kind: 'developer'
}

/** Retains plugin ownership without exposing setup registries to Runtime. */
export interface PluginHookContribution<TDeclarations extends object> {
	readonly declarations: TDeclarations
	readonly kind: 'plugin'
	readonly localName: string
	readonly ownerPlugin: string
	readonly targetKind: PluginHookTargetKind
}

/** Describes one declaration source without flattening its normalized phases. */
export type HookContribution<TDeclarations extends object> =
	| DeveloperHookContribution<TDeclarations>
	| PluginHookContribution<TDeclarations>

/** Precomputes plugin wrapping and its inverse around developer declarations. */
export interface HookContributionNesting<TDeclarations extends object> {
	readonly after: readonly HookContribution<TDeclarations>[]
	readonly before: readonly HookContribution<TDeclarations>[]
}

/** Retains one exact hooked field and its deterministic structural path. */
export interface FieldHookContributionPlan {
	readonly contributions: HookContributionNesting<FieldHookDeclarations>
	readonly field: GenericField
	readonly path: readonly string[]
}

/** Retains one schema's declarations and both field traversal directions. */
export interface SchemaHookContributionPlan {
	readonly contributions: HookContributionNesting<SchemaHookDeclarations>
	readonly fieldsAfter: readonly FieldHookContributionPlan[]
	readonly fieldsBefore: readonly FieldHookContributionPlan[]
	readonly schema: SchemaDefinition
}

/** Supplies immutable, identity-owned lookup views to the later dispatcher. */
export interface NativeHookContributionPlan {
	readonly schemas: readonly SchemaHookContributionPlan[]
	getField(
		schema: SchemaDefinition,
		path: readonly string[],
	): FieldHookContributionPlan | undefined
	getFields(
		schema: SchemaDefinition,
		field: GenericField,
	): readonly FieldHookContributionPlan[]
	getSchema(schema: SchemaDefinition): SchemaHookContributionPlan | undefined
}

interface MutableFieldPlan {
	readonly field: GenericField
	readonly path: readonly string[]
	readonly plugins: PluginHookContribution<FieldHookDeclarations>[]
}

interface MutableSchemaPlan {
	readonly fields: readonly MutableFieldPlan[]
	readonly fieldsByPath: ReadonlyMap<string, MutableFieldPlan>
	readonly plugins: PluginHookContribution<SchemaHookDeclarations>[]
	readonly schema: SchemaDefinition
}

interface SchemaPlanLookup {
	readonly fieldsByIdentity: WeakMap<
		object,
		readonly FieldHookContributionPlan[]
	>
	readonly fieldsByPath: ReadonlyMap<string, FieldHookContributionPlan>
	readonly plan: SchemaHookContributionPlan
}

const emptyFieldPlans: readonly FieldHookContributionPlan[] = immutableArray([])

/** Encodes segments without treating dots or other developer characters as syntax. */
const encodeFieldPath = (path: readonly string[]): string =>
	path.map((segment) => `${String(segment.length)}:${segment}`).join('')

const createPluginContribution = <TDeclarations extends object>(
	ownerPlugin: string,
	localName: string,
	targetKind: PluginHookTargetKind,
	declarations: TDeclarations,
): PluginHookContribution<TDeclarations> =>
	immutableRecord({
		declarations,
		kind: 'plugin',
		localName,
		ownerPlugin,
		targetKind,
	})

const createDeveloperContribution = <TDeclarations extends object>(
	declarations: TDeclarations,
): DeveloperHookContribution<TDeclarations> =>
	immutableRecord({ declarations, kind: 'developer' })

/** Builds both execution directions once while retaining declaration identity. */
const createContributionNesting = <TDeclarations extends object>(
	plugins: readonly PluginHookContribution<TDeclarations>[],
	developer: TDeclarations | undefined,
): HookContributionNesting<TDeclarations> => {
	const developerContribution =
		developer === undefined ? undefined : createDeveloperContribution(developer)
	const before: HookContribution<TDeclarations>[] = [...plugins]
	const after: HookContribution<TDeclarations>[] = []

	if (developerContribution !== undefined) {
		before.push(developerContribution)
		after.push(developerContribution)
	}

	for (let index = plugins.length - 1; index >= 0; index -= 1) {
		const plugin = plugins[index]

		if (plugin !== undefined) {
			after.push(plugin)
		}
	}

	return immutableRecord({
		after: immutableArray(after),
		before: immutableArray(before),
	})
}

const createMutableSchemaPlan = (
	schema: SchemaDefinition,
): MutableSchemaPlan => {
	const fields = collectFieldTraversalEntries(schema.fields).map(
		({ field, path }): MutableFieldPlan => ({ field, path, plugins: [] }),
	)
	const fieldsByPath = new Map<string, MutableFieldPlan>()

	for (const field of fields) {
		fieldsByPath.set(encodeFieldPath(field.path), field)
	}

	return {
		fields,
		fieldsByPath,
		plugins: [],
		schema,
	}
}

const appendPluginContributions = (
	application: FrameworkApplication<
		readonly SchemaDefinition[],
		readonly PluginDefinition[]
	>,
	plansBySchema: WeakMap<object, MutableSchemaPlan>,
): void => {
	for (const contribution of application.getContributions('hooks')) {
		const resolved = getResolvedPluginHookContribution(contribution.value)

		// ADR-0070 low-level contributions keep their existing Runtime path.
		if (resolved === undefined) {
			continue
		}

		for (const match of resolved.schemas) {
			const schemaPlan = plansBySchema.get(match.schema)

			if (schemaPlan === undefined) {
				throw new TypeError(
					`Plugin hook contribution "${resolved.localName}" resolved outside its application`,
				)
			}

			schemaPlan.plugins.push(
				createPluginContribution(
					resolved.ownerPlugin,
					resolved.localName,
					resolved.targetKind,
					match.declarations,
				),
			)
		}

		for (const match of resolved.fields) {
			const schemaPlan = plansBySchema.get(match.schema)
			const fieldPlan = schemaPlan?.fieldsByPath.get(
				encodeFieldPath(match.path),
			)

			if (fieldPlan?.field !== match.field) {
				throw new TypeError(
					`Plugin hook contribution "${resolved.localName}" resolved an inconsistent field target`,
				)
			}

			fieldPlan.plugins.push(
				createPluginContribution(
					resolved.ownerPlugin,
					resolved.localName,
					resolved.targetKind,
					match.declarations,
				),
			)
		}
	}
}

const finalizeSchemaPlan = (draft: MutableSchemaPlan): SchemaPlanLookup => {
	const fieldsBefore: FieldHookContributionPlan[] = []
	const fieldsByPath = new Map<string, FieldHookContributionPlan>()
	const mutableFieldsByIdentity = new WeakMap<
		object,
		FieldHookContributionPlan[]
	>()

	for (const fieldDraft of draft.fields) {
		const developer = getFieldHookDeclarations(fieldDraft.field)

		if (developer === undefined && fieldDraft.plugins.length === 0) {
			continue
		}

		const fieldPlan = immutableRecord({
			contributions: createContributionNesting(fieldDraft.plugins, developer),
			field: fieldDraft.field,
			path: fieldDraft.path,
		})

		fieldsBefore.push(fieldPlan)
		fieldsByPath.set(encodeFieldPath(fieldPlan.path), fieldPlan)

		const identityPlans = mutableFieldsByIdentity.get(fieldPlan.field) ?? []

		identityPlans.push(fieldPlan)
		mutableFieldsByIdentity.set(fieldPlan.field, identityPlans)
	}

	const fieldsByIdentity = new WeakMap<
		object,
		readonly FieldHookContributionPlan[]
	>()

	for (const fieldPlan of fieldsBefore) {
		const identityPlans = mutableFieldsByIdentity.get(fieldPlan.field)

		if (identityPlans !== undefined) {
			fieldsByIdentity.set(fieldPlan.field, immutableArray(identityPlans))
		}
	}

	const immutableFieldsBefore = immutableArray(fieldsBefore)
	const plan = immutableRecord({
		contributions: createContributionNesting(
			draft.plugins,
			getSchemaHookDeclarations(draft.schema),
		),
		fieldsAfter: immutableArray([...immutableFieldsBefore].reverse()),
		fieldsBefore: immutableFieldsBefore,
		schema: draft.schema,
	})

	return { fieldsByIdentity, fieldsByPath, plan }
}

/**
 * Compiles native hook declarations once after application setup has resolved
 * every plugin target. Callback functions are retained but never invoked here.
 */
export const compileNativeHookContributionPlan = <
	const TSchemas extends readonly SchemaDefinition[],
	const TPlugins extends readonly PluginDefinition[],
>(
	application: FrameworkApplication<TSchemas, TPlugins>,
): NativeHookContributionPlan => {
	if (!(application instanceof FrameworkApplication)) {
		throw new TypeError(
			'Native hook contribution plans require a FrameworkApplication',
		)
	}

	const drafts = application.schemas.values().map(createMutableSchemaPlan)
	const draftsBySchema = new WeakMap<object, MutableSchemaPlan>()

	for (const draft of drafts) {
		draftsBySchema.set(draft.schema, draft)
	}

	appendPluginContributions(application, draftsBySchema)

	const schemaPlans: SchemaHookContributionPlan[] = []
	const lookupsBySchema = new WeakMap<object, SchemaPlanLookup>()

	for (const draft of drafts) {
		const lookup = finalizeSchemaPlan(draft)

		schemaPlans.push(lookup.plan)
		lookupsBySchema.set(draft.schema, lookup)
	}

	return immutableRecord({
		schemas: immutableArray(schemaPlans),
		getField: (schema, path) =>
			lookupsBySchema.get(schema)?.fieldsByPath.get(encodeFieldPath(path)),
		getFields: (schema, field) =>
			lookupsBySchema.get(schema)?.fieldsByIdentity.get(field) ??
			emptyFieldPlans,
		getSchema: (schema) => lookupsBySchema.get(schema)?.plan,
	})
}

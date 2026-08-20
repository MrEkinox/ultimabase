import type {
	CompiledSchemaRegistry,
	GenericField,
	SchemaContributionOwner,
	SchemaDefinition,
} from '@ultimabase/core'
import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
} from '@ultimabase/shared'

import type { FieldHookDeclarations } from '../authoring/field-declarations.js'
import type { SchemaHookDeclarations } from '../authoring/declarations.js'
import type {
	HookContributionTargetKind,
	OwnedHookContribution,
} from '../contributions.js'

export interface DeveloperHookContribution<TDeclarations extends object> {
	readonly declarations: TDeclarations
	readonly kind: 'developer'
}

export interface PluginHookContribution<TDeclarations extends object> {
	readonly declarations: TDeclarations
	readonly kind: 'plugin'
	readonly localName: string
	readonly ownerPlugin: string
	readonly ownerInstanceId?: string
	readonly targetKind: HookContributionTargetKind
}

export type HookContribution<TDeclarations extends object> =
	| DeveloperHookContribution<TDeclarations>
	| PluginHookContribution<TDeclarations>

export interface HookContributionNesting<TDeclarations extends object> {
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
	readonly fieldsAfter: readonly FieldHookContributionPlan[]
	readonly fieldsBefore: readonly FieldHookContributionPlan[]
	readonly schema: SchemaDefinition
}

export interface HookContributionPlan {
	readonly schemas: readonly SchemaHookContributionPlan[]
	getField(
		schema: SchemaDefinition,
		path: readonly string[],
	): FieldHookContributionPlan | undefined
	getSchema(schema: SchemaDefinition): SchemaHookContributionPlan | undefined
}

interface MutableFieldPlan {
	readonly field: GenericField
	readonly inlineOwner: SchemaContributionOwner
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
	readonly fieldsByPath: ReadonlyMap<string, FieldHookContributionPlan>
	readonly plan: SchemaHookContributionPlan
}

const encodeFieldPath = (path: readonly string[]): string =>
	path.map((segment) => `${String(segment.length)}:${segment}`).join('')

const describeOwner = (owner: SchemaContributionOwner): string =>
	owner.kind === 'plugin'
		? `${owner.pluginId}${owner.instanceId === undefined ? '' : `#${owner.instanceId}`}`
		: owner.kind

/** Prevents plugin-owned option values from bypassing capability privilege checks. */
const assertApplicationOwnedInlineHooks = (
	owner: SchemaContributionOwner,
	path: string,
): void => {
	if (owner.kind === 'application') return

	throw new TypeError(
		`Inline Hooks at ${path} are owned by ${describeOwner(owner)}; plugins must use provideHookContributions()`,
	)
}

const collectFields = (
	fields: Readonly<Record<string, GenericField>>,
	owner: SchemaContributionOwner,
	parent: readonly string[] = immutableArray([]),
): readonly Readonly<{
	readonly field: GenericField
	readonly inlineOwner: SchemaContributionOwner
	readonly path: readonly string[]
}>[] =>
	immutableArray(
		Object.entries(fields).flatMap(([name, field]) => {
			const path = immutableArray([...parent, name])
			const current = immutableRecord({ field, inlineOwner: owner, path })
			const nestedFields: unknown = Reflect.get(field.options, 'fields')
			if (field.kind !== 'object' || !isPlainRecord(nestedFields)) {
				return [current]
			}
			return [
				current,
				...collectFields(
					nestedFields as Readonly<Record<string, GenericField>>,
					owner,
					path,
				),
			]
		}),
	)

const readSchemaDeclarations = (
	schema: SchemaDefinition,
): SchemaHookDeclarations | undefined =>
	Object.hasOwn(schema.definition, 'hooks')
		? (Reflect.get(schema.definition, 'hooks') as
				SchemaHookDeclarations | undefined)
		: undefined

const readFieldDeclarations = (
	field: GenericField,
): FieldHookDeclarations | undefined =>
	Object.hasOwn(field.options, 'hooks')
		? (Reflect.get(field.options, 'hooks') as FieldHookDeclarations | undefined)
		: undefined

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

const createContributionNesting = <TDeclarations extends object>(
	plugins: readonly PluginHookContribution<TDeclarations>[],
	developer: TDeclarations | undefined,
): HookContributionNesting<TDeclarations> => {
	const declared: DeveloperHookContribution<TDeclarations> | undefined =
		developer === undefined
			? undefined
			: immutableRecord({ declarations: developer, kind: 'developer' as const })
	const before: HookContribution<TDeclarations>[] = [...plugins]
	const after: HookContribution<TDeclarations>[] = []

	if (declared !== undefined) {
		before.push(declared)
		after.push(declared)
	}
	for (const contribution of plugins.toReversed()) after.push(contribution)

	return immutableRecord({
		after: immutableArray(after),
		before: immutableArray(before),
	})
}

const createMutableSchemaPlan = (
	schema: SchemaDefinition,
): MutableSchemaPlan => {
	const fields = Object.entries(schema.fields).flatMap(([name, field]) => {
		const owner =
			schema.provenance.fieldOptions[name]?.hooks?.value.owner ??
			schema.provenance.fields[name]?.owner ??
			schema.provenance.schema.owner
		return collectFields({ [name]: field }, owner).map(
			({ field: candidate, inlineOwner, path }) => ({
				field: candidate,
				inlineOwner,
				path,
				plugins: [],
			}),
		)
	})
	return {
		fields,
		fieldsByPath: new Map(
			fields.map((field) => [encodeFieldPath(field.path), field]),
		),
		plugins: [],
		schema,
	}
}

const applyPluginContributions = (
	drafts: readonly MutableSchemaPlan[],
	ownedContributions: readonly OwnedHookContribution[],
): void => {
	const draftsBySchema = new Map(drafts.map((draft) => [draft.schema, draft]))

	for (const owned of ownedContributions) {
		const definition = owned.definition
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

		const field = draft.fieldsByPath.get(encodeFieldPath(definition.path))
		if (field?.field !== definition.field) {
			throw new TypeError(
				`Hook contribution "${owned.contributionId}" resolved an inconsistent field target`,
			)
		}
		field.plugins.push(createPluginContribution(owned, definition.declarations))
	}
}

const finalizeSchemaPlan = (draft: MutableSchemaPlan): SchemaPlanLookup => {
	const fields: FieldHookContributionPlan[] = []
	const fieldsByPath = new Map<string, FieldHookContributionPlan>()

	for (const candidate of draft.fields) {
		const developer = readFieldDeclarations(candidate.field)
		if (developer === undefined && candidate.plugins.length === 0) continue
		if (developer !== undefined) {
			assertApplicationOwnedInlineHooks(
				candidate.inlineOwner,
				`${draft.schema.className}.fields.${candidate.path.join('.')}.hooks`,
			)
		}

		const field = immutableRecord({
			contributions: createContributionNesting(candidate.plugins, developer),
			field: candidate.field,
			path: candidate.path,
		})
		fields.push(field)
		fieldsByPath.set(encodeFieldPath(field.path), field)
	}

	const fieldsBefore = immutableArray(fields)
	const developer = readSchemaDeclarations(draft.schema)
	if (developer !== undefined) {
		assertApplicationOwnedInlineHooks(
			draft.schema.provenance.options.hooks?.value.owner ??
				draft.schema.provenance.schema.owner,
			`${draft.schema.className}.hooks`,
		)
	}

	return {
		fieldsByPath,
		plan: immutableRecord({
			contributions: createContributionNesting(draft.plugins, developer),
			fieldsAfter: immutableArray(fieldsBefore.toReversed()),
			fieldsBefore,
			schema: draft.schema,
		}),
	}
}

/** Compiles normalized inline and compatible-plugin declarations once per application. */
export const compileHookContributionPlan = (
	schemas: CompiledSchemaRegistry,
	contributions: readonly OwnedHookContribution[],
): HookContributionPlan => {
	const drafts = schemas.values().map(createMutableSchemaPlan)
	applyPluginContributions(drafts, contributions)
	const lookups = drafts.map(finalizeSchemaPlan)
	const bySchema = new Map(
		lookups.map((lookup) => [lookup.plan.schema, lookup]),
	)

	return immutableRecord({
		schemas: immutableArray(lookups.map(({ plan }) => plan)),
		getField: (schema, path) =>
			bySchema.get(schema)?.fieldsByPath.get(encodeFieldPath(path)),
		getSchema: (schema) => bySchema.get(schema)?.plan,
	})
}

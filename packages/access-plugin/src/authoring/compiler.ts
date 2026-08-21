import type { CompiledSchemaRegistry } from '@ultimabase/core'
import { immutableArray, immutableRecord } from '@ultimabase/shared'

import type { OwnedAccessContribution } from '../contributions.js'
import { readFieldKindAccessTarget } from '../targets.js'
import { normalizeFieldAccessDeclarations } from './field-declarations.js'
import {
	appendDeveloperDeclarations,
	appendFieldDeclarations,
	appendSchemaDeclarations,
	createMutableSchemaPlan,
	emptyFieldAccessPlans,
	encodeFieldPath,
	finalizeSchemaPlan,
	type AccessDefaultPolicy,
	type AccessPlan,
	type MutableSchemaAccessPlan,
	type PluginAccessSource,
	type SchemaAccessPlan,
	type SchemaAccessPlanLookup,
} from './plan.js'

const createPluginSource = (
	owned: OwnedAccessContribution,
): PluginAccessSource =>
	immutableRecord({
		kind: 'plugin' as const,
		localName: owned.contributionId,
		ownerPlugin: owned.owner.pluginId,
		...(owned.owner.instanceId === undefined
			? {}
			: { ownerInstanceId: owned.owner.instanceId }),
		targetKind: owned.definition.targetKind,
	})

const applyPluginContributions = (
	drafts: readonly MutableSchemaAccessPlan[],
	ownedContributions: readonly OwnedAccessContribution[],
): void => {
	const draftsBySchema = new Map(drafts.map((draft) => [draft.schema, draft]))

	for (const owned of ownedContributions) {
		const definition = owned.definition
		const source = createPluginSource(owned)
		if (definition.targetKind === 'field-kind') {
			const kind = readFieldKindAccessTarget(definition.target)
			for (const draft of drafts) {
				for (const fieldPlan of draft.fields) {
					if (fieldPlan.field.kind !== kind) continue
					const declarations = normalizeFieldAccessDeclarations(
						definition.create({
							field: fieldPlan.field,
							path: fieldPlan.path,
							schema: draft.schema,
						} as never),
					)
					if (declarations === undefined) {
						throw new TypeError(
							`Access contribution "${owned.contributionId}" must declare a field rule`,
						)
					}
					appendFieldDeclarations(fieldPlan, declarations, source)
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
				`Access contribution "${owned.contributionId}" targets a schema outside its application`,
			)
		}
		if (definition.targetKind === 'schema') {
			appendSchemaDeclarations(draft, definition.declarations, source)
			continue
		}
		const field = draft.fieldsByPath.get(encodeFieldPath(definition.path))
		if (field?.field !== definition.field) {
			throw new TypeError(
				`Access contribution "${owned.contributionId}" targets an unavailable field`,
			)
		}
		appendFieldDeclarations(field, definition.declarations, source)
	}
}

/** Compiles application and provider declarations into one immutable plan. */
export const compileAccessPlan = (
	registry: CompiledSchemaRegistry,
	defaults: AccessDefaultPolicy,
	contributions: readonly OwnedAccessContribution[] = immutableArray([]),
): AccessPlan => {
	const drafts = registry.values().map(createMutableSchemaPlan)
	applyPluginContributions(drafts, contributions)
	appendDeveloperDeclarations(drafts)

	const schemas: SchemaAccessPlan[] = []
	const lookupsBySchema = new WeakMap<object, SchemaAccessPlanLookup>()
	for (const draft of drafts) {
		const lookup = finalizeSchemaPlan(draft)
		schemas.push(lookup.plan)
		lookupsBySchema.set(draft.schema, lookup)
	}

	return immutableRecord({
		defaults,
		getField: (schema, path) =>
			lookupsBySchema.get(schema)?.fieldsByPath.get(encodeFieldPath(path)),
		getFields: (schema, field) =>
			lookupsBySchema.get(schema)?.fieldsByIdentity.get(field) ??
			emptyFieldAccessPlans,
		getSchema: (schema) => lookupsBySchema.get(schema)?.plan,
		schemas: immutableArray(schemas),
	})
}

import { immutableArray, immutableRecord } from '@ultimabase/shared'

import {
	fieldReadAccessChannels,
	fieldWriteAccessTransitions,
} from './field-declarations.js'
import {
	schemaFilterAccessFamilies,
	schemaItemAccessFamilies,
} from './declarations.js'
import {
	accessOperationKinds,
	encodeFieldPath,
	type CompiledAccessRule,
	type CompiledAccessRuleMap,
	type FieldAccessPlan,
	type MutableAccessRuleMap,
	type MutableSchemaAccessPlan,
	type SchemaAccessPlan,
	type SchemaMutationAccessPlan,
	type SchemaAccessPlanLookup,
} from './plan-contracts.js'

const finalizeRuleMap = <const TKey extends string>(
	keys: readonly TKey[],
	rules: MutableAccessRuleMap<TKey>,
): CompiledAccessRuleMap<TKey> => {
	const finalized = {} as Record<TKey, readonly CompiledAccessRule[]>
	for (const key of keys) finalized[key] = immutableArray(rules[key])
	return immutableRecord(finalized)
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
		schemaMutations: new Map(
			[...draft.schemaMutations].map(
				([command, mutation]): readonly [string, SchemaMutationAccessPlan] => [
					command,
					immutableRecord({
						descriptor: mutation.descriptor,
						filter: immutableArray(mutation.filter),
						item: immutableArray(mutation.item),
						operation: immutableArray(mutation.operation),
					}),
				],
			),
		),
		schema: draft.schema,
	})

	return { fieldsByIdentity, fieldsByPath, plan }
}

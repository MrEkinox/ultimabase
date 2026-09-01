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

import {
	fieldReadAccessChannels,
	fieldWriteAccessTransitions,
	type FieldAccessDeclarations,
} from './field-declarations.js'
import {
	schemaFilterAccessFamilies,
	schemaItemAccessFamilies,
	type SchemaAccessDeclarations,
	type SchemaReadAccessBranch,
} from './declarations.js'
import type { NormalizedAccessRule } from './normalization.js'
import {
	accessOperationKinds,
	encodeFieldPath,
	type AccessRuleSource,
	type CompiledAccessRule,
	type DeveloperAccessSource,
	type MutableAccessRuleMap,
	type MutableFieldAccessPlan,
	type MutableSchemaAccessPlan,
} from './plan-contracts.js'

const developerAccessSource: DeveloperAccessSource = immutableRecord({
	kind: 'developer',
})

const createMutableRuleMap = <const TKey extends string>(
	keys: readonly TKey[],
): MutableAccessRuleMap<TKey> => {
	const rules = {} as MutableAccessRuleMap<TKey>
	for (const key of keys) rules[key] = []
	return rules
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
	for (const kind of kinds) appendRule(rules, kind, rule, source)
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
				const rule = read[branch]
				if (rule !== undefined) {
					appendRuleToKinds(rules, schemaReadKinds[branch], rule, source)
				}
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
		if (rule !== undefined) appendRule(plan.filter, family, rule, source)
	}

	for (const family of schemaItemAccessFamilies) {
		const rule = declarations.item?.[family]
		if (rule !== undefined) appendRule(plan.item, family, rule, source)
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

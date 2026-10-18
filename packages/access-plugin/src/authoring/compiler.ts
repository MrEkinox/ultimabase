import type {
	ApplicationSchemaMutationSurface,
	CompiledSchemaRegistry,
	SchemaContributionOwner,
} from '@ultimabase/core'
import type { SchemaPermissionDeclaration } from '@ultimabase/core/plugin'
import { immutableArray, immutableRecord } from '@ultimabase/shared'

import type { OwnedAccessContribution } from '../contributions.js'
import { readFieldKindAccessTarget } from '../targets.js'
import type { AllowWithoutRulePlan } from './allow-without-rule.js'
import { normalizeFieldAccessDeclarations } from './field-declarations.js'
import {
	encodeFieldPath,
	type AccessPlan,
	type AccessRuleSource,
} from './plan.js'
import {
	appendFieldDeclarations,
	appendSchemaDeclarations,
	createSchemaDraft,
	developerSource,
	freezeSchemaDraft,
	type RuleLocator,
	type SchemaDraft,
} from './plan-drafts.js'
import type { SchemaAccessDeclarations } from './declarations.js'
import type { FieldAccessDeclarations } from './field-declarations.js'

const applyPluginContributions = (
	drafts: readonly SchemaDraft[],
	contributions: readonly OwnedAccessContribution[],
): void => {
	const draftsBySchema = new Map(drafts.map((draft) => [draft.schema, draft]))

	for (const { contributionId, definition, owner } of contributions) {
		const provider = `${owner.pluginId} contribution "${contributionId}"`
		const locateSchema =
			(className: string): RuleLocator =>
			(path) =>
				`${provider}: ${className}.access.${path}`
		const locateField =
			(className: string, field: readonly string[]): RuleLocator =>
			(path) =>
				`${provider}: ${className}.${field.join('.')}.access.${path}`
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
					appendFieldDeclarations(
						field,
						declarations,
						source,
						locateField(draft.schema.className, field.path),
					)
				}
			}
			continue
		}
		if (definition.targetKind === 'global') {
			for (const draft of drafts) {
				appendSchemaDeclarations(
					draft,
					definition.declarations,
					source,
					locateSchema(draft.schema.className),
				)
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
			appendSchemaDeclarations(
				draft,
				definition.declarations,
				source,
				locateSchema(draft.schema.className),
			)
			continue
		}
		const field = draft.fieldsByPath.get(encodeFieldPath(definition.path))
		if (field?.field !== definition.field) {
			throw new TypeError(
				`Access contribution "${contributionId}" targets an unavailable field`,
			)
		}
		appendFieldDeclarations(
			field,
			definition.declarations,
			source,
			locateField(draft.schema.className, field.path),
		)
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
			appendSchemaDeclarations(
				draft,
				schemaAccess,
				developerSource,
				(path) => `${className}.access.${path}`,
			)
		}

		for (const field of draft.fields) {
			const fieldAccess = readInlineAccess(field.field.options) as
				FieldAccessDeclarations | undefined
			if (fieldAccess !== undefined) {
				assertApplicationOwnedInlineAccess(
					field.inlineOwner,
					`${className}.${field.path.join('.')}.access`,
				)
				appendFieldDeclarations(
					field,
					fieldAccess,
					developerSource,
					(path) => `${className}.${field.path.join('.')}.access.${path}`,
				)
			}
		}
	}
}

/**
 * Rejects `allowWithoutRule` keys that name no request plugin operation or
 * permission; a plugin method such as `archiveOne` names its operation.
 */
const assertOpeningKeys = (
	allowWithoutRule: AllowWithoutRulePlan,
	drafts: readonly SchemaDraft[],
): void => {
	const requestCommands = drafts.flatMap((draft) =>
		[...draft.schemaMutations.values()].filter(
			({ descriptor }) => descriptor.mutation.authority === 'request',
		),
	)
	for (const key of allowWithoutRule.extensionKeys) {
		if (
			drafts.some((draft) => draft.permissions.has(key)) ||
			requestCommands.some(({ entry }) => entry.operation === key)
		) {
			continue
		}
		const method = requestCommands.find(({ entry }) => entry.method === key)
		if (method !== undefined) {
			throw new TypeError(
				`Access allowWithoutRule.${key} names a write method: use its operation ${method.entry.operation}`,
			)
		}
		throw new TypeError(
			`Unknown Access allowWithoutRule key: ${key} is neither an operation, a request plugin command nor a plugin permission`,
		)
	}
}

/** Compiles application and provider declarations into one immutable plan. */
export const compileAccessPlan = (
	registry: CompiledSchemaRegistry,
	allowWithoutRule: AllowWithoutRulePlan,
	contributions: readonly OwnedAccessContribution[] = [],
	mutationSurface?: ApplicationSchemaMutationSurface,
	permissions: readonly SchemaPermissionDeclaration[] = [],
): AccessPlan => {
	const drafts = registry.values().map((schema) =>
		createSchemaDraft(
			schema,
			mutationSurface?.get(schema) ?? [],
			permissions
				.filter((declaration) => declaration.schema === schema)
				.map(({ permission }) => permission),
		),
	)
	assertOpeningKeys(allowWithoutRule, drafts)
	// Provider rules precede developer rules in every compiled list.
	applyPluginContributions(drafts, contributions)
	appendDeveloperDeclarations(drafts)
	const plans = new WeakMap(
		drafts.map((draft) => [draft.schema, freezeSchemaDraft(draft)]),
	)

	return immutableRecord({
		allowWithoutRule,
		getField: (schema, path) =>
			plans.get(schema)?.fieldsByPath.get(encodeFieldPath(path)),
		getFields: (schema, field) =>
			immutableArray(
				plans.get(schema)?.fields.filter((plan) => plan.field === field) ?? [],
			),
		getSchema: (schema) => plans.get(schema),
	})
}

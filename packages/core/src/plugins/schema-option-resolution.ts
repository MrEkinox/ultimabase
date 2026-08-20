import { immutableRecord, isPlainRecord } from '@ultimabase/shared'

import { snapshotJsonValue } from '../schema/fields/builtins/json.js'

import type { GenericField } from '../schema/fields/base/contract.js'

import {
	assertFieldDefinition,
	getDeclaredFieldOptionsContract,
	replaceDeclaredFieldOptions,
} from '../schema/fields/base/definition.js'

import type { PreparedSchemaCompilation } from '../schema/schema/definition.js'

import { type PluginSchemaContributionOwner } from '../schema/schema/provenance.js'

import {
	attachPluginDeclarationDiagnostic,
	type OptionDefinitionIndex,
	type OwnedOptionDefinition,
	type ResolvedFieldOptions,
	resolveOptionDefinition,
} from './schema-declaration-contracts.js'

export const coreSchemaKeys: ReadonlySet<string> = new Set([
	'className',
	'constraints',
	'extensions',
	'fields',
	'indexes',
	'provenance',
])

export const normalizeOwnedOptionValue = (
	option: OwnedOptionDefinition,
	value: unknown,
	path: string,
): unknown => {
	let normalized: unknown

	try {
		normalized = option.definition.normalize(value, path)
	} catch (cause: unknown) {
		throw attachPluginDeclarationDiagnostic(
			new TypeError(
				`${path} is invalid for option owner ${option.owner.pluginId}`,
				{ cause },
			),
			option.owner,
			path,
			option.contributionId,
		)
	}

	return option.definition.valueKind === 'opaque'
		? normalized
		: snapshotJsonValue(normalized, path)
}

export const resolveFieldOptions = (
	field: GenericField,
	definitions: ReadonlyMap<string, readonly OwnedOptionDefinition[]>,
	path: string,
	resolvedFields: ResolvedFieldOptions,
	preferredOwner?: PluginSchemaContributionOwner,
): GenericField => {
	const existing = resolvedFields.get(field)?.get(preferredOwner)
	if (existing !== undefined) return existing

	const contract = getDeclaredFieldOptionsContract(field)
	const options: Record<string, unknown> = {}
	let changed = false

	for (const [key, value] of Object.entries(field.options)) {
		const descriptor = resolveOptionDefinition(
			definitions,
			key,
			`${path}.options.${key}`,
			preferredOwner,
		)
		const coreOwnsKey = contract?.optionKeys.includes(key) === true

		if (descriptor !== undefined && coreOwnsKey) {
			throw new TypeError(
				`Field option "${key}" from ${descriptor.owner.pluginId} conflicts with Core field ${field.kind}`,
			)
		}

		if (descriptor !== undefined) {
			changed = true
			options[key] = normalizeOwnedOptionValue(
				descriptor,
				value,
				`${path}.options.${key}`,
			)
			continue
		}

		if (contract !== undefined && !coreOwnsKey) {
			throw new TypeError(`Unknown ${field.kind} field option: ${key}`)
		}

		options[key] = value
	}

	if (field.kind === 'object' && isPlainRecord(options.fields)) {
		const nestedFields = immutableRecord(
			Object.fromEntries(
				Object.entries(options.fields).map(([name, nested]) => {
					assertFieldDefinition(nested, `${path}.options.fields.${name}`)
					return [
						name,
						resolveFieldOptions(
							nested,
							definitions,
							`${path}.options.fields.${name}`,
							resolvedFields,
							preferredOwner,
						),
					]
				}),
			),
		)
		if (
			Object.entries(options.fields).some(
				([name, nested]) => nestedFields[name] !== nested,
			)
		) {
			changed = true
			options.fields = nestedFields
		}
	}

	const resolved = changed
		? replaceDeclaredFieldOptions(field, immutableRecord(options))
		: field
	const ownerResolutions =
		resolvedFields.get(field) ??
		new Map<PluginSchemaContributionOwner | undefined, GenericField>()
	ownerResolutions.set(preferredOwner, resolved)
	resolvedFields.set(field, ownerResolutions)

	return resolved
}

export const resolveCandidateOptions = (
	candidate: PreparedSchemaCompilation,
	definitions: OptionDefinitionIndex,
	resolvedFields: ResolvedFieldOptions,
	preferredOwner?: PluginSchemaContributionOwner,
): PreparedSchemaCompilation => {
	const schemaOptions: Record<string, unknown> = {}

	for (const [key, value] of Object.entries(candidate.definition)) {
		if (coreSchemaKeys.has(key)) continue

		const descriptor = resolveOptionDefinition(
			definitions.schema,
			key,
			`${candidate.schema.className}.${key}`,
			preferredOwner,
		)
		if (descriptor === undefined) {
			throw new TypeError(`Unknown schema option: ${key}`)
		}

		schemaOptions[key] = normalizeOwnedOptionValue(
			descriptor,
			value,
			`${candidate.schema.className}.${key}`,
		)
	}

	const fields = immutableRecord(
		Object.fromEntries(
			Object.entries(candidate.definition.fields).map(([name, field]) => [
				name,
				resolveFieldOptions(
					field,
					definitions.field,
					`${candidate.schema.className}.fields.${name}`,
					resolvedFields,
					preferredOwner,
				),
			]),
		),
	) as typeof candidate.definition.fields
	const developerFields = immutableRecord(
		Object.fromEntries(
			Object.keys(candidate.developerFields).map((name) => [
				name,
				fields[name],
			]),
		),
	) as typeof candidate.developerFields

	return immutableRecord({
		definition: immutableRecord({
			...schemaOptions,
			className: candidate.definition.className,
			constraints: candidate.definition.constraints,
			fields,
			indexes: candidate.definition.indexes,
			extensions: candidate.definition.extensions,
			provenance: candidate.definition.provenance,
		}),
		developerFields,
		schema: candidate.schema,
	})
}

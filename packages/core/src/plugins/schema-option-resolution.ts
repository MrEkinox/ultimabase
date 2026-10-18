import { immutableRecord, isPlainRecord } from '@ultimabase/shared'
import { coreSchemaKeys } from '../schema/schema/registry.js'

import { snapshotJsonValue } from '../schema/fields/builtins/json.js'

import type { GenericField } from '../schema/fields/base/contract.js'

import {
	assertFieldDefinition,
	getDeclaredFieldOptionsContract,
	replaceDeclaredFieldOptions,
} from '../schema/fields/base/definition.js'

import type { PreparedSchemaCompilation } from '../schema/schema/definition.js'
import {
	createVirtualFieldDefinition,
	getVirtualFieldResolver,
	type GenericVirtualField,
} from '../schema/schema/virtual-field.js'

import { type PluginSchemaContributionOwner } from '../schema/schema/provenance.js'
import type { FieldDeclarationContext } from '../schema/schema/field-contexts.js'

import {
	attachPluginDeclarationDiagnostic,
	type OptionDefinitionIndex,
	type OwnedOptionDefinition,
	type ResolvedFieldOptions,
	resolveOptionDefinition,
} from './schema-declaration-contracts.js'

const resolveVirtualFieldOptions = (
	field: GenericVirtualField,
	definitions: ReadonlyMap<string, readonly OwnedOptionDefinition[]>,
	path: string,
	preferredOwner?: PluginSchemaContributionOwner,
): GenericVirtualField => {
	const options: Record<string, unknown> = {}

	for (const [key, value] of Object.entries(field.options)) {
		if (key === 'description') {
			if (typeof value !== 'string') {
				throw new TypeError(`${path}.options.description must be a string`)
			}
			options[key] = value
			continue
		}

		const descriptor = resolveOptionDefinition(
			definitions,
			key,
			`${path}.options.${key}`,
			preferredOwner,
		)
		if (
			descriptor?.scope !== 'field' ||
			!('contexts' in descriptor.definition) ||
			!descriptor.definition.contexts.includes('virtual')
		) {
			throw new TypeError(`Unknown virtual field option: ${key}`)
		}
		options[key] = normalizeOwnedOptionValue(
			descriptor,
			value,
			`${path}.options.${key}`,
		)
	}

	return createVirtualFieldDefinition(
		field.output,
		field.select,
		getVirtualFieldResolver(field),
		immutableRecord(options),
	)
}

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
	context: FieldDeclarationContext,
	preferredOwner?: PluginSchemaContributionOwner,
): GenericField => {
	const existing = resolvedFields.get(field)?.get(context)?.get(preferredOwner)
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
			if (
				descriptor.scope !== 'field' ||
				!('contexts' in descriptor.definition) ||
				!descriptor.definition.contexts.includes(context)
			) {
				throw new TypeError(
					`Field option "${key}" from ${descriptor.owner.pluginId} does not support the ${context} context`,
				)
			}
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
							'embedded',
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
	const contextResolutions =
		resolvedFields.get(field) ??
		new Map<
			FieldDeclarationContext,
			Map<PluginSchemaContributionOwner | undefined, GenericField>
		>()
	const ownerResolutions =
		contextResolutions.get(context) ??
		new Map<PluginSchemaContributionOwner | undefined, GenericField>()
	ownerResolutions.set(preferredOwner, resolved)
	contextResolutions.set(context, ownerResolutions)
	resolvedFields.set(field, contextResolutions)

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
			Object.entries(candidate.definition.persistedFields).map(
				([name, field]) => [
					name,
					resolveFieldOptions(
						field,
						definitions.field,
						`${candidate.schema.className}.fields.${name}`,
						resolvedFields,
						'stored',
						preferredOwner,
					),
				],
			),
		),
	) as typeof candidate.definition.persistedFields
	const virtualFields = immutableRecord(
		Object.fromEntries(
			Object.entries(candidate.definition.virtualFields).map(
				([name, field]) => [
					name,
					resolveVirtualFieldOptions(
						field,
						definitions.field,
						`${candidate.schema.className}.fields.${name}`,
						preferredOwner,
					),
				],
			),
		),
	) as typeof candidate.definition.virtualFields
	const logicalFields = immutableRecord({ ...fields, ...virtualFields })
	const developerFields = immutableRecord(
		Object.fromEntries(
			Object.keys(candidate.developerFields).map((name) => [
				name,
				logicalFields[name],
			]),
		),
	) as typeof candidate.developerFields

	// Core keys such as `expose` (ADR-0347) pass through unchanged.
	const coreEntries = Object.entries(candidate.definition).filter(([key]) =>
		coreSchemaKeys.has(key),
	)

	return immutableRecord({
		definition: immutableRecord({
			...schemaOptions,
			...Object.fromEntries(coreEntries),
			className: candidate.definition.className,
			fields: logicalFields,
			indexes: candidate.definition.indexes,
			persistedFields: fields,
			provenance: candidate.definition.provenance,
			virtualFields,
		}),
		developerFields,
		schema: candidate.schema,
	})
}

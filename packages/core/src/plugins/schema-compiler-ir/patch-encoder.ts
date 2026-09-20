import { immutableArray, immutableRecord } from '@ultimabase/shared'

import type { GenericField } from '../../schema/fields/base/contract.js'
import { getDeclaredFieldOptionsContract } from '../../schema/fields/base/definition.js'
import {
	snapshotJsonValue,
	type JsonValue,
} from '../../schema/fields/builtins/json.js'
import {
	coreSchemaContributionOwner,
	createSchemaContributionProvenance,
	type PluginSchemaContributionOwner,
	type SchemaOptionProvenance,
} from '../../schema/schema/provenance.js'
import type {
	OptionDefinitionIndex,
	ResolvedFieldOptions,
} from '../schema-declaration-contracts.js'
import { resolveOptionDefinition } from '../schema-declaration-contracts.js'
import {
	normalizeOwnedOptionValue,
	resolveFieldOptions,
} from '../schema-option-resolution.js'
import type { SchemaPatchOperation } from '../schema-patch-contracts.js'
import type { SchemaCompilerPatchOperation } from './contracts.js'
import type { SchemaCompilerIrEncoder } from './encoder.js'

interface PatchEncodingContext {
	readonly definitions: OptionDefinitionIndex
	readonly encoder: SchemaCompilerIrEncoder
	readonly owner: PluginSchemaContributionOwner
	readonly path: string
	readonly resolvedFields: ResolvedFieldOptions
	readonly staticOptions: Readonly<Record<string, JsonValue>>
}

const operationProvenance = (
	operation: SchemaPatchOperation,
	context: PatchEncodingContext,
) =>
	createSchemaContributionProvenance(
		context.owner,
		operation.contributionId,
		context.staticOptions,
	)

const normalizedField = (
	field: GenericField,
	path: string,
	context: PatchEncodingContext,
): GenericField =>
	resolveFieldOptions(
		field,
		context.definitions.field,
		path,
		context.resolvedFields,
		'stored',
		context.owner,
	)

const fieldOptionProvenance = (
	field: GenericField,
	contributionId: string,
	context: PatchEncodingContext,
): Readonly<Record<string, SchemaOptionProvenance>> => {
	const contribution = createSchemaContributionProvenance(
		context.owner,
		contributionId,
		context.staticOptions,
	)
	const contract = getDeclaredFieldOptionsContract(field)
	return immutableRecord(
		Object.fromEntries(
			Object.keys(field.options).map((name) => {
				const definition = resolveOptionDefinition(
					context.definitions.field,
					name,
					`${context.path}.options.${name}`,
					context.owner,
				)
				return [
					name,
					immutableRecord({
						definition:
							definition === undefined
								? createSchemaContributionProvenance(
										contract?.optionKeys.includes(name) === true
											? coreSchemaContributionOwner
											: context.owner,
										`field-option-definition:${field.kind}.${name}`,
									)
								: createSchemaContributionProvenance(
										definition.owner,
										definition.contributionId,
										definition.staticOptions,
										definition.definition.protocolVersion,
									),
						value: contribution,
					}),
				]
			}),
		),
	)
}

const normalizedOptionValue = (
	scope: 'field' | 'schema',
	name: string,
	value: unknown,
	path: string,
	context: PatchEncodingContext,
): JsonValue => {
	const definition = resolveOptionDefinition(
		context.definitions[scope],
		name,
		path,
		context.owner,
	)
	if (definition === undefined) {
		throw new TypeError(`Unknown ${scope} option: ${name}`)
	}
	if (
		scope === 'field' &&
		(!('contexts' in definition.definition) ||
			!definition.definition.contexts.includes('stored'))
	) {
		throw new TypeError(
			`Field option "${name}" from ${definition.owner.pluginId} does not support the stored context`,
		)
	}
	return snapshotJsonValue(
		normalizeOwnedOptionValue(definition, value, path),
		path,
	)
}

const normalizedIndex = (
	fields: readonly [string, string, ...string[]],
	unique: boolean | undefined,
) =>
	immutableRecord({
		fields: immutableArray(fields),
		unique: unique ?? false,
	})

const assertNeverOperation = (operation: never): never => {
	throw new TypeError(`Unsupported schema compiler patch: ${String(operation)}`)
}

/** Converts one nominal patch operation into callback-free compiler IR. */
export const encodeSchemaCompilerPatchOperation = (
	operation: SchemaPatchOperation,
	context: PatchEncodingContext,
): SchemaCompilerPatchOperation => {
	const provenance = operationProvenance(operation, context)
	const path = `${context.path}.${operation.contributionId}`

	switch (operation.kind) {
		case 'field:add': {
			const field = normalizedField(operation.field, `${path}.field`, context)
			return immutableRecord({
				contributionId: operation.contributionId,
				field: context.encoder.fieldNode(
					field,
					operation.name,
					`${path}.field`,
					provenance,
					fieldOptionProvenance(field, operation.contributionId, context),
				),
				kind: operation.kind,
				name: operation.name,
			})
		}
		case 'index:add':
			return immutableRecord({
				contributionId: operation.contributionId,
				index: normalizedIndex(operation.index.fields, operation.index.unique),
				kind: operation.kind,
			})
		case 'constraint:add':
			return immutableRecord({
				constraint: context.encoder.constraintNode(
					operation.constraint,
					provenance,
					`${path}.constraint`,
				),
				contributionId: operation.contributionId,
				kind: operation.kind,
			})
		case 'schema-option:set':
			return immutableRecord({
				contributionId: operation.contributionId,
				kind: operation.kind,
				name: operation.name,
				value: context.encoder.optionValue(
					normalizedOptionValue(
						'schema',
						operation.name,
						operation.value,
						`${path}.value`,
						context,
					),
					`${path}.value`,
				),
			})
		case 'field-option:set':
			return immutableRecord({
				contributionId: operation.contributionId,
				field: operation.field,
				kind: operation.kind,
				name: operation.name,
				value: context.encoder.optionValue(
					normalizedOptionValue(
						'field',
						operation.name,
						operation.value,
						`${path}.value`,
						context,
					),
					`${path}.value`,
				),
			})
		default:
			return assertNeverOperation(operation)
	}
}

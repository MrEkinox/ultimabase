import { immutableArray, immutableRecord } from '@ultimabase/shared'

import {
	coreSchemaContributionOwner,
	createSchemaContributionProvenance,
	type PluginSchemaContributionOwner,
	type SchemaOptionProvenance,
} from '../../schema/schema/provenance.js'
import {
	snapshotJsonValue,
	type JsonValue,
} from '../../schema/fields/builtins/json.js'
import type { GenericField } from '../../schema/fields/base/contract.js'
import { getDeclaredFieldOptionsContract } from '../../schema/fields/base/definition.js'
import type {
	OptionDefinitionIndex,
	ResolvedFieldOptions,
} from '../schema-declaration-contracts.js'
import { resolveOptionDefinition } from '../schema-declaration-contracts.js'
import {
	normalizeOwnedOptionValue,
	resolveFieldOptions,
} from '../schema-option-resolution.js'
import type {
	ExistingSchemaContributionTarget,
	SchemaPatchOperation,
} from '../schema-patch-contracts.js'
import type {
	SchemaCompilerArtifactKind,
	SchemaCompilerArtifactReference,
	SchemaCompilerContributionTarget,
	SchemaCompilerOptionValue,
	SchemaCompilerPatchOperation,
} from './contracts.js'
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

const encodeArtifactTarget = <
	TExpected,
	const TKind extends SchemaCompilerArtifactKind,
>(
	target: ExistingSchemaContributionTarget<TExpected>,
	artifactKind: TKind,
	context: PatchEncodingContext,
): SchemaCompilerContributionTarget<SchemaCompilerArtifactReference<TKind>> =>
	immutableRecord({
		contributionId: target.contributionId,
		expected: context.encoder.targetReference(
			artifactKind,
			target.contributionId,
			target.owner,
			target.expected,
			`${context.path}.target.expected`,
		),
		owner: target.owner,
	})

const encodeValueTarget = (
	target: ExistingSchemaContributionTarget<unknown>,
	context: PatchEncodingContext,
): SchemaCompilerContributionTarget<SchemaCompilerOptionValue> =>
	immutableRecord({
		contributionId: target.contributionId,
		expected: context.encoder.optionValue(
			target.expected,
			`${context.path}.target.expected`,
		),
		owner: target.owner,
	})

const encodePortableTarget = <TExpected>(
	target: ExistingSchemaContributionTarget<TExpected>,
): SchemaCompilerContributionTarget<TExpected> =>
	immutableRecord({
		contributionId: target.contributionId,
		expected: target.expected,
		owner: target.owner,
	})

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
		case 'field:replace': {
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
				target: encodeArtifactTarget(operation.target, 'field', {
					...context,
					path,
				}),
			})
		}
		case 'field:rename':
			return immutableRecord({
				contributionId: operation.contributionId,
				from: operation.from,
				kind: operation.kind,
				target: encodeArtifactTarget(operation.target, 'field', {
					...context,
					path,
				}),
				to: operation.to,
			})
		case 'field:remove':
			return immutableRecord({
				contributionId: operation.contributionId,
				kind: operation.kind,
				name: operation.name,
				target: encodeArtifactTarget(operation.target, 'field', {
					...context,
					path,
				}),
			})
		case 'index:add':
			return immutableRecord({
				contributionId: operation.contributionId,
				index: normalizedIndex(operation.index.fields, operation.index.unique),
				kind: operation.kind,
			})
		case 'index:replace':
			return immutableRecord({
				contributionId: operation.contributionId,
				index: normalizedIndex(operation.index.fields, operation.index.unique),
				kind: operation.kind,
				target: encodePortableTarget(operation.target),
			})
		case 'index:remove':
			return immutableRecord({
				contributionId: operation.contributionId,
				kind: operation.kind,
				target: encodePortableTarget(operation.target),
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
		case 'constraint:replace':
			return immutableRecord({
				constraint: context.encoder.constraintNode(
					operation.constraint,
					provenance,
					`${path}.constraint`,
				),
				contributionId: operation.contributionId,
				kind: operation.kind,
				target: encodeArtifactTarget(operation.target, 'constraint', {
					...context,
					path,
				}),
			})
		case 'constraint:remove':
			return immutableRecord({
				contributionId: operation.contributionId,
				kind: operation.kind,
				target: encodeArtifactTarget(operation.target, 'constraint', {
					...context,
					path,
				}),
			})
		case 'schema-option:set':
			return immutableRecord({
				contributionId: operation.contributionId,
				kind: operation.kind,
				name: operation.name,
				...(operation.target === undefined
					? {}
					: {
							target: encodeValueTarget(operation.target, {
								...context,
								path,
							}),
						}),
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
		case 'schema-option:remove':
			return immutableRecord({
				contributionId: operation.contributionId,
				kind: operation.kind,
				name: operation.name,
				target: encodeValueTarget(operation.target, { ...context, path }),
			})
		case 'field-option:set':
			return immutableRecord({
				contributionId: operation.contributionId,
				field: operation.field,
				kind: operation.kind,
				name: operation.name,
				...(operation.target === undefined
					? {}
					: {
							target: encodeValueTarget(operation.target, {
								...context,
								path,
							}),
						}),
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
		case 'field-option:remove':
			return immutableRecord({
				contributionId: operation.contributionId,
				field: operation.field,
				kind: operation.kind,
				name: operation.name,
				target: encodeValueTarget(operation.target, { ...context, path }),
			})
		default:
			return assertNeverOperation(operation)
	}
}

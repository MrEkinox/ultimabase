import { immutableArray, immutableRecord } from '@ultimabase/shared'

import {
	createSchemaContributionProvenance,
	type PluginSchemaContributionOwner,
} from '../../schema/schema/provenance.js'
import type { JsonValue } from '../../schema/fields/builtins/json.js'
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
	readonly encoder: SchemaCompilerIrEncoder
	readonly owner: PluginSchemaContributionOwner
	readonly path: string
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
		expected: context.encoder.reference(
			artifactKind,
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
		case 'field:add':
			return immutableRecord({
				contributionId: operation.contributionId,
				field: context.encoder.fieldNode(
					operation.field,
					operation.name,
					`${path}.field`,
					provenance,
				),
				kind: operation.kind,
				name: operation.name,
			})
		case 'field:replace':
			return immutableRecord({
				contributionId: operation.contributionId,
				field: context.encoder.fieldNode(
					operation.field,
					operation.name,
					`${path}.field`,
					provenance,
				),
				kind: operation.kind,
				name: operation.name,
				target: encodeArtifactTarget(operation.target, 'field', {
					...context,
					path,
				}),
			})
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
		case 'extension:add':
			return immutableRecord({
				contributionId: operation.contributionId,
				extension: context.encoder.extensionNode(
					operation.extension,
					operation.extension.name,
					provenance,
					`${path}.extension`,
				),
				kind: operation.kind,
			})
		case 'extension:replace':
			return immutableRecord({
				contributionId: operation.contributionId,
				extension: context.encoder.extensionNode(
					operation.extension,
					operation.extension.name,
					provenance,
					`${path}.extension`,
				),
				kind: operation.kind,
				target: encodeArtifactTarget(operation.target, 'extension', {
					...context,
					path,
				}),
			})
		case 'extension:remove':
			return immutableRecord({
				contributionId: operation.contributionId,
				kind: operation.kind,
				target: encodeArtifactTarget(operation.target, 'extension', {
					...context,
					path,
				}),
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
				value: context.encoder.optionValue(operation.value, `${path}.value`),
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
				value: context.encoder.optionValue(operation.value, `${path}.value`),
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

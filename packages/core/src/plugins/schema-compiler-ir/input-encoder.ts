import { immutableArray, immutableRecord } from '@ultimabase/shared'

import type {
	PreparedSchemaCompilation,
	SchemaDefinition,
} from '../../schema/schema/definition.js'
import type {
	OwnedOptionDefinition,
	SchemaDeclarationBatch,
} from '../schema-declaration-contracts.js'
import type { SchemaSelection } from '../schema-patch-contracts.js'
import type {
	SchemaCompilerInput,
	SchemaCompilerOptionDefinitionNode,
	SchemaCompilerPatchNode,
	SchemaCompilerPluginDeclarationNode,
	SchemaCompilerSchemaNode,
} from './contracts.js'
import { schemaCompilerProtocolVersion } from './contracts.js'
import type { SchemaCompilerArtifactSession } from './artifacts.js'
import { SchemaCompilerIrEncoder } from './encoder.js'
import { encodeSchemaCompilerPatchOperation } from './patch-encoder.js'
import { assertSchemaCompilerInput } from './validation.js'

/** Keeps the public request separate from its private application artifact table. */
export interface PreparedSchemaCompilerInput {
	readonly input: SchemaCompilerInput
	readonly session: SchemaCompilerArtifactSession
}

class SchemaCompilerDeclarationEncoder {
	readonly #selectionIds = new WeakMap<object, string>()
	#nextSelectionId: number

	constructor(
		private readonly encoder: SchemaCompilerIrEncoder,
		private readonly schemas: ReadonlyMap<
			SchemaDefinition,
			SchemaCompilerSchemaNode
		>,
	) {
		this.#nextSelectionId = 0
	}

	declaration(
		batch: SchemaDeclarationBatch,
		order: number,
	): SchemaCompilerPluginDeclarationNode {
		return immutableRecord({
			additions: immutableArray(
				batch.additions.map((addition) => {
					const { schema } = addition
					const node = this.schemas.get(schema)
					if (node === undefined) {
						throw new TypeError(
							`Missing prepared schema addition: ${schema.className}`,
						)
					}
					return immutableRecord({
						contributionId: addition.contributionId,
						schema: node,
						staticOptions: addition.staticOptions,
					})
				}),
			),
			optionDefinitions: immutableArray(
				batch.options.map((option, index) =>
					this.optionDefinition(
						option,
						`declarations.${String(order)}.options.${String(index)}`,
					),
				),
			),
			order,
			owner: batch.owner,
			patches: immutableArray(
				batch.patches.map((patch, index) =>
					this.patch(
						patch,
						`declarations.${String(order)}.patches.${String(index)}`,
					),
				),
			),
		})
	}

	private optionDefinition(
		option: OwnedOptionDefinition,
		path: string,
	): SchemaCompilerOptionDefinitionNode {
		const requirement = option.definition.runtime?.requirement

		return immutableRecord({
			artifact: this.encoder.reference(
				'option-definition',
				option.definition,
				path,
			),
			contributionId: option.contributionId,
			name: option.name,
			owner: option.owner,
			protocolVersion: option.definition.protocolVersion,
			...(requirement === undefined
				? {}
				: {
						runtimeRequirement: immutableRecord({
							capabilityId: requirement.token.capabilityId,
							optional: requirement.optional,
							version: requirement.version,
						}),
					}),
			scope: option.scope,
			staticOptions: option.staticOptions,
			typegen: option.definition.typegen,
		})
	}

	private patch(
		patch: SchemaDeclarationBatch['patches'][number],
		path: string,
	): SchemaCompilerPatchNode {
		return immutableRecord({
			operations: immutableArray(
				patch.operations.map((operation) =>
					encodeSchemaCompilerPatchOperation(operation, {
						encoder: this.encoder,
						owner: patch.owner,
						path,
						staticOptions: patch.staticOptions,
					}),
				),
			),
			owner: patch.owner,
			selectionId: this.selectionId(patch.targets),
			selector: patch.targets.selector,
			staticOptions: patch.staticOptions,
		})
	}

	private selectionId(selection: SchemaSelection): string {
		const existing = this.#selectionIds.get(selection)
		if (existing !== undefined) return existing

		const selectionId = `selection:${String(this.#nextSelectionId)}`
		this.#nextSelectionId += 1
		this.#selectionIds.set(selection, selectionId)
		return selectionId
	}
}

/** Encodes every prepared declaration into one validated callback-free request. */
export const encodeSchemaCompilerInput = (
	prepared: readonly PreparedSchemaCompilation[],
	batches: readonly SchemaDeclarationBatch[],
): PreparedSchemaCompilerInput => {
	const encoder = new SchemaCompilerIrEncoder()
	const schemas = immutableArray(
		prepared.map((candidate, index) =>
			encoder.schemaNode(
				candidate,
				`schemas.${String(index)}.${candidate.schema.className}`,
			),
		),
	)
	const schemasByDefinition = new Map<
		SchemaDefinition,
		SchemaCompilerSchemaNode
	>()
	for (const [index, candidate] of prepared.entries()) {
		const schema = schemas[index]
		if (schema === undefined) throw new TypeError('Missing encoded schema node')
		schemasByDefinition.set(candidate.schema, schema)
	}
	const declarationEncoder = new SchemaCompilerDeclarationEncoder(
		encoder,
		schemasByDefinition,
	)
	const addedSchemas = new Set(
		batches.flatMap((batch) => batch.additions.map(({ schema }) => schema)),
	)
	const input = immutableRecord({
		declarations: immutableArray(
			batches.map((batch, order) =>
				declarationEncoder.declaration(batch, order),
			),
		),
		protocolVersion: schemaCompilerProtocolVersion,
		schemas: immutableArray(
			prepared.flatMap((candidate, index) => {
				const schema = schemas[index]
				return addedSchemas.has(candidate.schema) || schema === undefined
					? []
					: [schema]
			}),
		),
	})

	assertSchemaCompilerInput(input, encoder.session)
	return immutableRecord({ input, session: encoder.session })
}

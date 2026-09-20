import { immutableArray, immutableRecord } from '@ultimabase/shared'

import type {
	PreparedSchemaCompilation,
	SchemaDefinition,
} from '../../schema/schema/definition.js'
import {
	resolveOptionDefinition,
	type OptionDefinitionIndex,
	type OwnedOptionDefinition,
	type ResolvedFieldOptions,
	type SchemaDeclarationBatch,
} from '../schema-declaration-contracts.js'
import type { SchemaSelection } from '../schema-patch-contracts.js'
import { collectOptionDefinitions } from '../schema-runtime-options.js'
import type { SchemaCompilerArtifactSession } from './artifacts.js'
import type {
	SchemaCompilerInput,
	SchemaCompilerOptionDefinitionNode,
	SchemaCompilerPatchNode,
	SchemaCompilerPluginDeclarationNode,
	SchemaCompilerSchemaNode,
} from './contracts.js'
import { schemaCompilerProtocolVersion } from './contracts.js'
import { SchemaCompilerIrEncoder } from './encoder.js'
import { encodeSchemaCompilerPatchOperation } from './patch-encoder.js'
import { assertSchemaCompilerInput } from './validation.js'

/** Keeps the public request separate from its private application artifact table. */
export interface PreparedSchemaCompilerInput {
	readonly input: SchemaCompilerInput
	readonly session: SchemaCompilerArtifactSession
}

/** Reuses the exact static normalization state that prepared initial schemas. */
export interface SchemaCompilerEncodingPreparation {
	readonly definitions: OptionDefinitionIndex
	readonly resolvedFields: ResolvedFieldOptions
}

class SchemaCompilerDeclarationEncoder {
	constructor(
		private readonly encoder: SchemaCompilerIrEncoder,
		private readonly preparation: SchemaCompilerEncodingPreparation,
		private readonly schemas: ReadonlyMap<
			SchemaDefinition,
			SchemaCompilerSchemaNode
		>,
	) {}

	declaration(
		batch: SchemaDeclarationBatch,
		order: number,
	): SchemaCompilerPluginDeclarationNode {
		const selections = new Map(
			[
				...batch.patches.map(({ targets }) => targets),
				...batch.surfaces.modelSurfaces.flatMap(({ target }) =>
					target.kind === 'selection' ? [target.selection] : [],
				),
			].map((selection) => [selection.selectionId, selection]),
		)
		for (const selection of selections.values()) {
			this.assertKnownOptionSelector(selection, batch)
		}

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
			selections: immutableArray(
				[...selections.values()].map(({ selectionId, selector }) =>
					immutableRecord({ selectionId, selector }),
				),
			),
		})
	}

	/** Prevents a replacement compiler from interpreting an unresolved option name. */
	private assertKnownOptionSelector(
		selection: SchemaSelection,
		batch: SchemaDeclarationBatch,
	): void {
		const option = selection.selector.option
		if (option === undefined) return
		const definition = resolveOptionDefinition(
			this.preparation.definitions.schema,
			option.name,
			`schema selector option.${option.name}`,
			batch.owner,
		)
		if (definition === undefined) {
			throw new TypeError(`Unknown schema selector option: ${option.name}`)
		}
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
			...(option.scope === 'field' && 'contexts' in option.definition
				? { contexts: option.definition.contexts }
				: {}),
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
						definitions: this.preparation.definitions,
						encoder: this.encoder,
						owner: patch.owner,
						path,
						resolvedFields: this.preparation.resolvedFields,
						staticOptions: patch.staticOptions,
					}),
				),
			),
			owner: patch.owner,
			selectionId: patch.targets.selectionId,
			selector: patch.targets.selector,
			staticOptions: patch.staticOptions,
		})
	}
}

/** Encodes every prepared declaration into one validated callback-free request. */
export const encodeSchemaCompilerInput = (
	prepared: readonly PreparedSchemaCompilation[],
	batches: readonly SchemaDeclarationBatch[],
	preparation: SchemaCompilerEncodingPreparation = {
		definitions: collectOptionDefinitions(batches),
		resolvedFields: new WeakMap(),
	},
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
		preparation,
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

import type {
	ApplicationSchemaMutationTransportPlan,
	CompiledSchemaRegistry,
	ExposedSchemaMutationTransportBinding,
	PluginSchemaContributionOwner,
	SchemaDefinition,
} from '@ultimabase/core'
import {
	GraphQLID,
	GraphQLInputObjectType,
	GraphQLNonNull,
	type GraphQLFieldConfigMap,
} from 'graphql'

import type { GraphqlBindingTypeCompiler } from './binding-type-compiler.js'
import { GraphqlSchemaCompilationError } from './errors.js'
import type { GraphqlFieldTypeCompiler } from './field-compiler.js'
import type { GraphqlGeneratedExecution } from './generated-execution.js'
import {
	assertGraphqlFieldName,
	graphqlFieldTypeSegment,
	type GraphqlNameRegistry,
} from './names.js'
import {
	normalizeGraphqlSchemaMutationBindingMetadata,
	type GraphqlSchemaMutationBindingMetadata,
} from './operation-metadata.js'
import type { graphqlProtocol } from './protocol.js'
import { bindingOwnerFor } from './operation-schema-types.js'
import type { GraphqlSchemaMutationExecution } from './schema-mutation-execution.js'
import type { GraphqlSchemaSurface } from './surfaces.js'

interface CompiledSchemaMutationBinding {
	readonly descriptor: ExposedSchemaMutationTransportBinding
	readonly metadata: GraphqlSchemaMutationBindingMetadata
	readonly owner: PluginSchemaContributionOwner
	readonly schema: SchemaDefinition
	readonly surface: GraphqlSchemaSurface
}

/** Compiles schema-local mutation bindings without accepting owner-chosen roots. */
export class GraphqlSchemaMutationSchemaCompiler {
	readonly #bindings: readonly CompiledSchemaMutationBinding[]
	readonly #execution: GraphqlGeneratedExecution
	readonly #fieldTypes: GraphqlFieldTypeCompiler
	readonly #names: GraphqlNameRegistry
	readonly #types: GraphqlBindingTypeCompiler

	constructor(options: {
		readonly execution: GraphqlGeneratedExecution
		readonly fieldTypes: GraphqlFieldTypeCompiler
		readonly names: GraphqlNameRegistry
		readonly plan: ApplicationSchemaMutationTransportPlan<
			typeof graphqlProtocol
		>
		readonly schemaMutations: GraphqlSchemaMutationExecution
		readonly schemas: CompiledSchemaRegistry
		readonly surfaces: ReadonlyMap<SchemaDefinition, GraphqlSchemaSurface>
		readonly types: GraphqlBindingTypeCompiler
	}) {
		this.#execution = options.execution
		this.#fieldTypes = options.fieldTypes
		this.#names = options.names
		this.#types = options.types
		const bindings: CompiledSchemaMutationBinding[] = []
		for (const descriptor of options.plan.mutations) {
			if (descriptor.authority !== 'request') continue
			const schema = options.schemas.get(descriptor.schema)
			const surface = schema && options.surfaces.get(schema)
			if (schema === undefined || surface === undefined) {
				throw new TypeError(
					`GraphQL schema mutation ${descriptor.command} targets an unavailable schema`,
				)
			}
			if (surface.owner.kind !== 'application' || !surface.schemaMutations) {
				continue
			}
			const metadata = normalizeGraphqlSchemaMutationBindingMetadata(
				descriptor.metadata,
				descriptor.mutation,
			)
			const owner = bindingOwnerFor(descriptor)
			this.#types.register({
				definitions: metadata.types,
				description: `schema mutation ${descriptor.mutation}`,
				owner,
				references:
					metadata.input === undefined
						? []
						: [{ mode: 'input', reference: metadata.input }],
			})
			options.schemaMutations.select(descriptor)
			bindings.push({ descriptor, metadata, owner, schema, surface })
		}
		this.#bindings = bindings
	}

	addRootFields(fields: GraphQLFieldConfigMap<unknown, unknown>): void {
		for (const binding of this.#bindings) {
			const fieldName = `${binding.descriptor.command}${binding.surface.typeName}`
			assertGraphqlFieldName(
				fieldName,
				`schema mutation ${binding.descriptor.mutation} for ${binding.schema.className}`,
				binding.owner,
			)
			if (Object.hasOwn(fields, fieldName)) {
				throw new GraphqlSchemaCompilationError(
					'name-collision',
					`GraphQL root field "${fieldName}" from schema mutation ${binding.descriptor.mutation} collides with an existing field`,
					{ owner: binding.owner, path: fieldName },
				)
			}
			const inputName = `${graphqlFieldTypeSegment(binding.descriptor.command)}${binding.surface.typeName}Input`
			this.#names.claimType(inputName, {
				description: `schema mutation ${binding.descriptor.mutation} for ${binding.schema.className}`,
				owner: binding.owner,
			})
			const input = new GraphQLInputObjectType({
				name: inputName,
				fields: {
					...(binding.metadata.input === undefined
						? {}
						: {
								data: { type: this.#types.inputType(binding.metadata.input) },
							}),
					id: { type: new GraphQLNonNull(GraphQLID) },
				},
			})
			fields[fieldName] = {
				args: { input: { type: new GraphQLNonNull(input) } },
				resolve: this.#execution.schemaMutation(
					binding.descriptor,
					binding.schema,
					binding.metadata.input !== undefined,
				),
				// Schema-mutation targets may become invisible after persistence, so the
				// v1 root remains nullable like update and delete.
				type: this.#fieldTypes.model(binding.schema),
			}
		}
	}
}

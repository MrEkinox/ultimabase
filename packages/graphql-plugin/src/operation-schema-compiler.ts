import type {
	ApplicationOperationTransportPlan,
	ExposedOperationTransportBinding,
} from '@ultimabase/core'
import { isPlainRecord } from '@ultimabase/shared'
import type { GraphQLFieldConfigMap } from 'graphql'

import type { GraphqlBindingTypeCompiler } from './binding-type-compiler.js'
import { GraphqlSchemaCompilationError } from './errors.js'
import type { GraphqlGeneratedExecution } from './generated-execution.js'
import { assertGraphqlFieldName } from './names.js'
import {
	normalizeGraphqlOperationBindingMetadata,
	type GraphqlOperationBindingMetadata,
} from './operation-metadata.js'
import { bindingOwnerFor } from './operation-schema-types.js'

interface CompiledBinding {
	readonly descriptor: ExposedOperationTransportBinding
	readonly metadata: GraphqlOperationBindingMetadata
}

/** Compiles callback-free application-operation metadata into GraphQL roots. */
export class GraphqlOperationSchemaCompiler {
	readonly #bindings: readonly CompiledBinding[]
	readonly #execution: GraphqlGeneratedExecution
	readonly #types: GraphqlBindingTypeCompiler

	constructor(
		options: Readonly<{
			readonly execution: GraphqlGeneratedExecution
			readonly plan: ApplicationOperationTransportPlan
			readonly types: GraphqlBindingTypeCompiler
		}>,
	) {
		this.#execution = options.execution
		this.#types = options.types
		this.#bindings = options.plan.operations.map((descriptor) => ({
			descriptor,
			metadata: normalizeGraphqlOperationBindingMetadata(
				descriptor.metadata,
				descriptor.name,
			),
		}))
		for (const binding of this.#bindings) {
			const owner = bindingOwnerFor(binding.descriptor)
			this.#types.register({
				definitions: binding.metadata.types,
				description: `operation ${binding.descriptor.name}`,
				owner,
				references: [
					...(binding.metadata.input === undefined
						? []
						: [{ mode: 'input' as const, reference: binding.metadata.input }]),
					{ mode: 'output', reference: binding.metadata.result },
				],
			})
		}
	}

	addRootFields(
		query: GraphQLFieldConfigMap<unknown, unknown>,
		mutation: GraphQLFieldConfigMap<unknown, unknown>,
	): void {
		for (const binding of this.#bindings) {
			const fields = binding.metadata.root === 'query' ? query : mutation
			const owner = bindingOwnerFor(binding.descriptor)
			assertGraphqlFieldName(
				binding.metadata.field,
				`operation ${binding.descriptor.name}`,
				owner,
			)
			if (Object.hasOwn(fields, binding.metadata.field)) {
				throw new GraphqlSchemaCompilationError(
					'name-collision',
					`GraphQL root field "${binding.metadata.field}" from operation ${binding.descriptor.name} collides with an existing field`,
					{ owner, path: binding.metadata.field },
				)
			}
			fields[binding.metadata.field] = {
				...(binding.metadata.input === undefined
					? {}
					: {
							args: {
								input: { type: this.#types.inputType(binding.metadata.input) },
							},
						}),
				resolve: (_source, args: unknown, contextValue) =>
					this.#execution.operation(
						binding.descriptor,
						binding.metadata.input === undefined
							? null
							: isPlainRecord(args)
								? this.#types.decodeInput(binding.metadata.input, args.input)
								: undefined,
						contextValue,
					),
				type: this.#types.outputType(binding.metadata.result),
			}
		}
	}
}

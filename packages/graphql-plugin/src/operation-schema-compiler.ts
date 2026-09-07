import { isDeepStrictEqual } from 'node:util'

import type {
	ApplicationOperationTransportPlan,
	ExposedOperationTransportBinding,
	PluginSchemaContributionOwner,
	SchemaDefinition,
} from '@ultimabase/core'
import { isPlainRecord } from '@ultimabase/shared'
import {
	GraphQLEnumType,
	GraphQLInputObjectType,
	GraphQLList,
	GraphQLNonNull,
	GraphQLObjectType,
	type GraphQLFieldConfigMap,
	type GraphQLInputFieldConfigMap,
	type GraphQLInputType,
	type GraphQLNamedType,
	type GraphQLNullableInputType,
	type GraphQLNullableOutputType,
	type GraphQLOutputType,
} from 'graphql'

import { GraphqlSchemaCompilationError } from './errors.js'
import type { GraphqlFieldTypeCompiler } from './field-compiler.js'
import type { GraphqlGeneratedExecution } from './generated-execution.js'
import { assertGraphqlFieldName, type GraphqlNameRegistry } from './names.js'
import {
	normalizeGraphqlOperationBindingMetadata,
	type GraphqlOperationBindingMetadata,
	type GraphqlOperationNullableTypeReference,
	type GraphqlOperationSupportingTypeDefinition,
	type GraphqlOperationTypeReference,
} from './operation-metadata.js'
import {
	graphqlOperationBuiltInTypes,
	isSameOperationOwner,
	operationOwnerFor,
} from './operation-schema-types.js'
import type { GraphqlSchemaSurface } from './surfaces.js'

interface CompiledBinding {
	readonly descriptor: ExposedOperationTransportBinding
	readonly metadata: GraphqlOperationBindingMetadata
}

interface OwnedDefinition {
	readonly definition: GraphqlOperationSupportingTypeDefinition
	readonly owner: PluginSchemaContributionOwner
}

const enumNamePattern = /^[_A-Za-z][_0-9A-Za-z]*$/u
/** Compiles callback-free operation metadata into the shared GraphQL roots. */
export class GraphqlOperationSchemaCompiler {
	readonly #bindings: readonly CompiledBinding[]
	readonly #definitions = new Map<string, OwnedDefinition>()
	readonly #execution: GraphqlGeneratedExecution
	readonly #fields: GraphqlFieldTypeCompiler
	readonly #names: GraphqlNameRegistry
	readonly #schemaByClassName: ReadonlyMap<string, SchemaDefinition>
	readonly #types = new Map<string, GraphQLNamedType>()
	readonly #typeOrder: string[] = []
	readonly #visited = new Set<string>()

	constructor(
		options: Readonly<{
			readonly execution: GraphqlGeneratedExecution
			readonly fields: GraphqlFieldTypeCompiler
			readonly names: GraphqlNameRegistry
			readonly plan: ApplicationOperationTransportPlan
			readonly surfaces: ReadonlyMap<SchemaDefinition, GraphqlSchemaSurface>
		}>,
	) {
		this.#execution = options.execution
		this.#fields = options.fields
		this.#names = options.names
		this.#schemaByClassName = new Map(
			[...options.surfaces.keys()].map((schema) => [schema.className, schema]),
		)
		this.#bindings = options.plan.operations.map((descriptor) => ({
			descriptor,
			metadata: normalizeGraphqlOperationBindingMetadata(
				descriptor.metadata,
				descriptor.name,
			),
		}))
		for (const binding of this.#bindings) this.#register(binding)
		for (const binding of this.#bindings) {
			if (binding.metadata.input !== undefined) {
				this.#visit(binding.metadata.input, 'input')
			}
			this.#visit(binding.metadata.result, 'output')
		}
		const unreachable = [...this.#definitions.keys()].filter(
			(name) => !this.#visited.has(name),
		)
		if (unreachable.length > 0) {
			throw new TypeError(
				`GraphQL operation supporting type ${unreachable[0] ?? 'unknown'} is unreachable`,
			)
		}
		for (const name of this.#typeOrder) this.#supportingType(name)
	}

	get types(): readonly GraphQLNamedType[] {
		return this.#typeOrder.map((name) => {
			const type = this.#types.get(name)
			if (type === undefined) {
				throw new TypeError(`GraphQL operation type ${name} is unavailable`)
			}
			return type
		})
	}

	#register(binding: CompiledBinding): void {
		const owner = operationOwnerFor(binding.descriptor)
		const localNames = new Set<string>()
		for (const definition of binding.metadata.types) {
			if (localNames.has(definition.name)) {
				throw new GraphqlSchemaCompilationError(
					'name-collision',
					`GraphQL operation ${binding.descriptor.name} repeats type ${definition.name}`,
					{ owner, path: definition.name },
				)
			}
			localNames.add(definition.name)
			const existing = this.#definitions.get(definition.name)
			if (existing !== undefined) {
				if (
					isSameOperationOwner(existing.owner, owner) &&
					isDeepStrictEqual(existing.definition, definition)
				) {
					continue
				}
				throw new GraphqlSchemaCompilationError(
					'name-collision',
					`GraphQL operation type "${definition.name}" has conflicting definitions`,
					{ owner, path: definition.name },
				)
			}
			this.#names.claimType(definition.name, {
				description: `operation ${binding.descriptor.name}`,
				owner,
			})
			this.#assertDefinitionFields(definition, owner)
			this.#definitions.set(definition.name, { definition, owner })
			this.#typeOrder.push(definition.name)
		}
	}

	#assertDefinitionFields(
		definition: GraphqlOperationSupportingTypeDefinition,
		owner: PluginSchemaContributionOwner,
	): void {
		if (definition.kind === 'enum') {
			const values = new Set<string>()
			for (const value of definition.values) {
				if (
					!enumNamePattern.test(value) ||
					value.startsWith('__') ||
					values.has(value)
				) {
					throw new GraphqlSchemaCompilationError(
						'invalid-name',
						`Invalid or duplicate GraphQL enum value "${value}" in ${definition.name}`,
						{ owner, path: `${definition.name}.${value}` },
					)
				}
				values.add(value)
			}
			return
		}
		const fields = new Set<string>()
		for (const field of definition.fields) {
			assertGraphqlFieldName(
				field.name,
				`operation type ${definition.name}`,
				owner,
			)
			if (fields.has(field.name)) {
				throw new GraphqlSchemaCompilationError(
					'name-collision',
					`GraphQL operation type ${definition.name} repeats field ${field.name}`,
					{ owner, path: `${definition.name}.${field.name}` },
				)
			}
			fields.add(field.name)
		}
	}

	#visit(
		reference: GraphqlOperationTypeReference,
		mode: 'input' | 'output',
	): void {
		if (reference.kind === 'list' || reference.kind === 'non-null') {
			this.#visit(reference.ofType, mode)
			return
		}
		if (reference.kind === 'schema') {
			if (
				mode === 'input' ||
				!this.#schemaByClassName.has(reference.className)
			) {
				throw new TypeError(
					`GraphQL operation schema reference ${reference.className} is unavailable as ${mode}`,
				)
			}
			return
		}
		if (graphqlOperationBuiltInTypes.has(reference.name)) return
		const owned = this.#definitions.get(reference.name)
		if (
			owned === undefined ||
			(mode === 'input' && owned.definition.kind === 'object') ||
			(mode === 'output' && owned.definition.kind === 'input-object')
		) {
			throw new TypeError(
				`GraphQL operation type reference ${reference.name} is unavailable as ${mode}`,
			)
		}
		if (this.#visited.has(reference.name)) return
		this.#visited.add(reference.name)
		if (owned.definition.kind !== 'enum') {
			for (const field of owned.definition.fields) {
				this.#visit(field.type, mode)
			}
		}
	}

	#supportingType(name: string): GraphQLNamedType {
		const existing = this.#types.get(name)
		if (existing !== undefined) return existing
		const owned = this.#definitions.get(name)
		if (owned === undefined) {
			throw new TypeError(`Unknown GraphQL operation type ${name}`)
		}
		if (owned.definition.kind === 'enum') {
			const values = Object.fromEntries(
				owned.definition.values.map((value) => [value, { value }]),
			)
			const type = new GraphQLEnumType({ name, values })
			this.#types.set(name, type)
			return type
		}
		const definition = owned.definition
		const type =
			definition.kind === 'input-object'
				? new GraphQLInputObjectType({
						name,
						fields: () => this.#inputFields(definition),
					})
				: new GraphQLObjectType({
						name,
						fields: () => this.#outputFields(definition),
					})
		this.#types.set(name, type)
		return type
	}

	#nullableInput(
		reference: GraphqlOperationNullableTypeReference,
	): GraphQLNullableInputType {
		if (reference.kind === 'list') {
			return new GraphQLList(this.#inputType(reference.ofType))
		}
		if (reference.kind === 'schema') {
			throw new TypeError('Application schema types cannot be GraphQL inputs')
		}
		const type =
			graphqlOperationBuiltInTypes.get(reference.name) ??
			this.#supportingType(reference.name)
		if (
			!(type instanceof GraphQLInputObjectType) &&
			!(type instanceof GraphQLEnumType) &&
			!graphqlOperationBuiltInTypes.has(reference.name)
		) {
			throw new TypeError(
				`GraphQL operation input type ${reference.name} is invalid`,
			)
		}
		return type as GraphQLNullableInputType
	}

	#inputType(reference: GraphqlOperationTypeReference): GraphQLInputType {
		return reference.kind === 'non-null'
			? new GraphQLNonNull(this.#nullableInput(reference.ofType))
			: this.#nullableInput(reference)
	}

	#nullableOutput(
		reference: GraphqlOperationNullableTypeReference,
	): GraphQLNullableOutputType {
		if (reference.kind === 'list') {
			return new GraphQLList(this.#outputType(reference.ofType))
		}
		if (reference.kind === 'schema') {
			const schema = this.#schemaByClassName.get(reference.className)
			if (schema === undefined) {
				throw new TypeError(
					`Unknown GraphQL operation schema ${reference.className}`,
				)
			}
			return this.#fields.model(schema)
		}
		const type =
			graphqlOperationBuiltInTypes.get(reference.name) ??
			this.#supportingType(reference.name)
		if (type instanceof GraphQLInputObjectType) {
			throw new TypeError(
				`GraphQL operation output type ${reference.name} is invalid`,
			)
		}
		return type as GraphQLNullableOutputType
	}

	#outputType(reference: GraphqlOperationTypeReference): GraphQLOutputType {
		return reference.kind === 'non-null'
			? new GraphQLNonNull(this.#nullableOutput(reference.ofType))
			: this.#nullableOutput(reference)
	}

	#inputFields(
		definition: Extract<
			GraphqlOperationSupportingTypeDefinition,
			{ readonly kind: 'input-object' }
		>,
	): GraphQLInputFieldConfigMap {
		return Object.fromEntries(
			definition.fields.map((field) => [
				field.name,
				{ type: this.#inputType(field.type) },
			]),
		)
	}

	#outputFields(
		definition: Extract<
			GraphqlOperationSupportingTypeDefinition,
			{ readonly kind: 'object' }
		>,
	): GraphQLFieldConfigMap<unknown, unknown> {
		return Object.fromEntries(
			definition.fields.map((field) => [
				field.name,
				{ type: this.#outputType(field.type) },
			]),
		)
	}

	addRootFields(
		query: GraphQLFieldConfigMap<unknown, unknown>,
		mutation: GraphQLFieldConfigMap<unknown, unknown>,
	): void {
		for (const binding of this.#bindings) {
			const fields = binding.metadata.root === 'query' ? query : mutation
			const owner = operationOwnerFor(binding.descriptor)
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
								input: { type: this.#inputType(binding.metadata.input) },
							},
						}),
				resolve: (_source, args: unknown, contextValue) =>
					this.#execution.operation(
						binding.descriptor,
						binding.metadata.input === undefined
							? null
							: isPlainRecord(args)
								? args.input
								: undefined,
						contextValue,
					),
				type: this.#outputType(binding.metadata.result),
			}
		}
	}
}

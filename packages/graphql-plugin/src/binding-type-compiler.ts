import { isDeepStrictEqual } from 'node:util'
import { isPlainRecord } from '@ultimabase/shared'

import type {
	PluginSchemaContributionOwner,
	CompiledSchemaRegistry,
} from '@ultimabase/core'
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
import type { GraphqlMutationInputCompiler } from './mutation-input-compiler.js'
import { decodeGraphqlMutationData } from './nested-mutation-values.js'
import { assertGraphqlFieldName, type GraphqlNameRegistry } from './names.js'
import type {
	GraphqlOperationNullableTypeReference,
	GraphqlOperationSupportingTypeDefinition,
	GraphqlOperationTypeReference,
} from './operation-metadata.js'
import {
	graphqlOperationBuiltInTypes,
	isSameOperationOwner,
} from './operation-schema-types.js'

interface OwnedDefinition {
	readonly definition: GraphqlOperationSupportingTypeDefinition
	readonly owner: PluginSchemaContributionOwner
}

interface BindingReference {
	readonly mode: 'input' | 'output'
	readonly reference: GraphqlOperationTypeReference
}

const enumNamePattern = /^[_A-Za-z][_0-9A-Za-z]*$/u

/** Owns the closed supporting-type graph shared by every plugin binding family. */
export class GraphqlBindingTypeCompiler {
	readonly #definitions = new Map<string, OwnedDefinition>()
	readonly #fields: GraphqlFieldTypeCompiler
	readonly #inputs: GraphqlMutationInputCompiler
	readonly #names: GraphqlNameRegistry
	readonly #references: BindingReference[] = []
	readonly #schemas: CompiledSchemaRegistry
	readonly #types = new Map<string, GraphQLNamedType>()
	readonly #visited = new Set<string>()
	#finalized = false

	constructor(options: {
		readonly fields: GraphqlFieldTypeCompiler
		readonly inputs: GraphqlMutationInputCompiler
		readonly names: GraphqlNameRegistry
		readonly schemas: CompiledSchemaRegistry
	}) {
		this.#fields = options.fields
		this.#inputs = options.inputs
		this.#names = options.names
		this.#schemas = options.schemas
	}

	get types(): readonly GraphQLNamedType[] {
		this.#assertFinalized()
		return [...this.#definitions.keys()].map((name) => {
			const type = this.#types.get(name)
			if (type === undefined) {
				throw new TypeError(`GraphQL binding type ${name} is unavailable`)
			}
			return type
		})
	}

	register(options: {
		readonly definitions: readonly GraphqlOperationSupportingTypeDefinition[]
		readonly description: string
		readonly owner: PluginSchemaContributionOwner
		readonly references: readonly BindingReference[]
	}): void {
		if (this.#finalized) {
			throw new TypeError('GraphQL binding types are already finalized')
		}
		const localNames = new Set<string>()
		for (const definition of options.definitions) {
			if (localNames.has(definition.name)) {
				throw new GraphqlSchemaCompilationError(
					'name-collision',
					`${options.description} repeats type ${definition.name}`,
					{ owner: options.owner, path: definition.name },
				)
			}
			localNames.add(definition.name)
			const existing = this.#definitions.get(definition.name)
			if (existing !== undefined) {
				if (
					isSameOperationOwner(existing.owner, options.owner) &&
					isDeepStrictEqual(existing.definition, definition)
				) {
					continue
				}
				throw new GraphqlSchemaCompilationError(
					'name-collision',
					`GraphQL binding type "${definition.name}" has conflicting definitions`,
					{ owner: options.owner, path: definition.name },
				)
			}
			this.#names.claimType(definition.name, {
				description: options.description,
				owner: options.owner,
			})
			this.#assertDefinitionFields(definition, options.owner)
			this.#definitions.set(definition.name, {
				definition,
				owner: options.owner,
			})
		}
		this.#references.push(...options.references)
	}

	finalize(): void {
		if (this.#finalized) return
		for (const { mode, reference } of this.#references) {
			this.#visit(reference, mode)
		}
		const unreachable = [...this.#definitions.keys()].filter(
			(name) => !this.#visited.has(name),
		)
		if (unreachable.length > 0) {
			throw new TypeError(
				`GraphQL binding supporting type ${unreachable[0] ?? 'unknown'} is unreachable`,
			)
		}
		this.#finalized = true
		for (const name of this.#definitions.keys()) this.#supportingType(name)
	}

	inputType(reference: GraphqlOperationTypeReference): GraphQLInputType {
		this.#assertFinalized()
		return reference.kind === 'non-null'
			? new GraphQLNonNull(this.#nullableInput(reference.ofType))
			: this.#nullableInput(reference)
	}

	outputType(reference: GraphqlOperationTypeReference): GraphQLOutputType {
		this.#assertFinalized()
		return reference.kind === 'non-null'
			? new GraphQLNonNull(this.#nullableOutput(reference.ofType))
			: this.#nullableOutput(reference)
	}

	/** Applies existing schema codecs without executing validation or defaults twice. */
	decodeInput(
		reference: GraphqlOperationTypeReference,
		value: unknown,
	): unknown {
		if (value === null || value === undefined) return value
		if (reference.kind === 'non-null')
			return this.decodeInput(reference.ofType, value)
		if (reference.kind === 'list')
			return Array.isArray(value)
				? value.map((item: unknown) => this.decodeInput(reference.ofType, item))
				: value
		if (reference.kind !== 'named' || !isPlainRecord(value)) return value
		const owned = this.#definitions.get(reference.name)
		if (owned?.definition.kind !== 'input-object') return value
		const definition = owned.definition
		const schema =
			definition.createFieldsFrom === undefined
				? undefined
				: this.#schemas.get(definition.createFieldsFrom)
		const decoded =
			schema === undefined
				? value
				: decodeGraphqlMutationData(schema, value, 'create', 'nested')
		if (!isPlainRecord(decoded)) return decoded
		return Object.fromEntries(
			Object.entries(decoded).map(([name, item]) => {
				const field = definition.fields.find(
					(candidate) => candidate.name === name,
				)
				return [
					name,
					field === undefined ? item : this.decodeInput(field.type, item),
				]
			}),
		)
	}

	#assertFinalized(): void {
		if (!this.#finalized) {
			throw new TypeError('GraphQL binding types are not finalized')
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
		if (
			definition.kind === 'input-object' &&
			definition.createFieldsFrom !== undefined
		) {
			const schema = this.#schemas.get(definition.createFieldsFrom)
			const schemaOwner = schema?.definition.provenance.schema.owner
			if (
				schema === undefined ||
				schemaOwner?.kind !== 'plugin' ||
				!isSameOperationOwner(schemaOwner, owner)
			) {
				throw new TypeError(
					`GraphQL binding ${definition.name} cannot use create fields from ${definition.createFieldsFrom}`,
				)
			}
			for (const name of Object.keys(
				this.#inputs.createInput(schema)?.getFields() ?? {},
			))
				fields.add(name)
		}
		for (const field of definition.fields) {
			assertGraphqlFieldName(
				field.name,
				`binding type ${definition.name}`,
				owner,
			)
			if (fields.has(field.name)) {
				throw new GraphqlSchemaCompilationError(
					'name-collision',
					`GraphQL binding type ${definition.name} repeats field ${field.name}`,
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
				!this.#schemas.has(reference.className)
			) {
				throw new TypeError(
					`GraphQL binding schema reference ${reference.className} is unavailable as ${mode}`,
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
				`GraphQL binding type reference ${reference.name} is unavailable as ${mode}`,
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
			throw new TypeError(`Unknown GraphQL binding type ${name}`)
		}
		if (owned.definition.kind === 'enum') {
			const type = new GraphQLEnumType({
				name,
				values: Object.fromEntries(
					owned.definition.values.map((value) => [value, { value }]),
				),
			})
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
			return new GraphQLList(this.inputType(reference.ofType))
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
				`GraphQL binding input type ${reference.name} is invalid`,
			)
		}
		return type as GraphQLNullableInputType
	}

	#nullableOutput(
		reference: GraphqlOperationNullableTypeReference,
	): GraphQLNullableOutputType {
		if (reference.kind === 'list') {
			return new GraphQLList(this.outputType(reference.ofType))
		}
		if (reference.kind === 'schema') {
			const schema = this.#schemas.get(reference.className)
			if (schema === undefined) {
				throw new TypeError(
					`Unknown GraphQL binding schema ${reference.className}`,
				)
			}
			return this.#fields.model(schema)
		}
		const type =
			graphqlOperationBuiltInTypes.get(reference.name) ??
			this.#supportingType(reference.name)
		if (type instanceof GraphQLInputObjectType) {
			throw new TypeError(
				`GraphQL binding output type ${reference.name} is invalid`,
			)
		}
		return type as GraphQLNullableOutputType
	}

	#inputFields(
		definition: Extract<
			GraphqlOperationSupportingTypeDefinition,
			{ readonly kind: 'input-object' }
		>,
	): GraphQLInputFieldConfigMap {
		const schema =
			definition.createFieldsFrom === undefined
				? undefined
				: this.#schemas.get(definition.createFieldsFrom)
		return {
			...(schema === undefined
				? {}
				: this.#inputs.createInput(schema)?.getFields()),
			...Object.fromEntries(
				definition.fields.map((field) => [
					field.name,
					{ type: this.inputType(field.type) },
				]),
			),
		}
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
				{ type: this.outputType(field.type) },
			]),
		)
	}
}

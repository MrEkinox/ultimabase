import { isDeepStrictEqual } from 'node:util'

import type {
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
	isEnumType,
	isInputObjectType,
	isObjectType,
	isScalarType,
	type GraphQLInputType,
	type GraphQLNamedType,
	type GraphQLNullableInputType,
	type GraphQLNullableOutputType,
	type GraphQLOutputType,
} from 'graphql'

import {
	isSameBindingOwner,
	type GraphqlOperationNullableTypeReference,
	type GraphqlOperationSupportingTypeDefinition,
	type GraphqlOperationTypeReference,
} from './binding-metadata.js'
import {
	assertGraphqlFieldName,
	isGraphqlName,
	type GraphqlCompileContext,
} from './compile-context.js'
import { GraphqlSchemaCompilationError } from './errors.js'
import type { GraphqlFieldTypeCompiler } from './field-compiler.js'
import type { GraphqlMutationInputCompiler } from './mutation-input-compiler.js'
import { readGraphqlBuiltInType } from './scalar-types.js'
import { decodeGraphqlMutationData } from './wire-values.js'

type Mode = 'input' | 'output'

interface OwnedDefinition {
	readonly definition: GraphqlOperationSupportingTypeDefinition
	readonly owner: PluginSchemaContributionOwner
}

/** Selects the direction in which a binding root uses one type reference. */
export interface GraphqlBindingReference {
	readonly mode: Mode
	readonly reference: GraphqlOperationTypeReference
}

type InputObjectDefinition = Extract<
	GraphqlOperationSupportingTypeDefinition,
	{ readonly kind: 'input-object' }
>

/** Owns the closed supporting-type graph shared by every plugin binding family. */
export class GraphqlBindingTypes {
	readonly #ctx: GraphqlCompileContext
	readonly #fields: GraphqlFieldTypeCompiler
	readonly #inputs: GraphqlMutationInputCompiler
	readonly #definitions = new Map<string, OwnedDefinition>()
	readonly #references: GraphqlBindingReference[] = []
	readonly #types = new Map<string, GraphQLNamedType>()

	constructor(
		ctx: GraphqlCompileContext,
		fields: GraphqlFieldTypeCompiler,
		inputs: GraphqlMutationInputCompiler,
	) {
		this.#ctx = ctx
		this.#fields = fields
		this.#inputs = inputs
	}

	register(
		definitions: readonly GraphqlOperationSupportingTypeDefinition[],
		description: string,
		owner: PluginSchemaContributionOwner,
		references: readonly GraphqlBindingReference[],
	): void {
		const localNames = new Set<string>()
		for (const definition of definitions) {
			const { name } = definition
			const failure = (message: string) =>
				new GraphqlSchemaCompilationError('name-collision', message, {
					owner,
					path: name,
				})
			if (localNames.has(name)) {
				throw failure(`${description} repeats type ${name}`)
			}
			localNames.add(name)
			const existing = this.#definitions.get(name)
			if (existing !== undefined) {
				// One plugin may repeat an identical definition across its bindings.
				if (
					isSameBindingOwner(existing.owner, owner) &&
					isDeepStrictEqual(existing.definition, definition)
				) {
					continue
				}
				throw failure(
					`GraphQL binding type "${name}" has conflicting definitions`,
				)
			}
			this.#ctx.names.claimType(name, description, owner)
			this.#assertDefinitionFields(definition, owner)
			this.#definitions.set(name, { definition, owner })
		}
		this.#references.push(...references)
	}

	/** Proves every definition is reachable in a compatible mode, then creates it. */
	finalize(): void {
		const visited = new Set<string>()
		const visit = (reference: GraphqlOperationTypeReference, mode: Mode) => {
			if (reference.kind === 'list' || reference.kind === 'non-null') {
				visit(reference.ofType, mode)
				return
			}
			if (reference.kind === 'schema') {
				if (mode === 'input' || !this.#ctx.schemas.has(reference.className)) {
					throw new TypeError(
						`GraphQL binding schema reference ${reference.className} is unavailable as ${mode}`,
					)
				}
				return
			}
			if (readGraphqlBuiltInType(reference.name) !== undefined) return
			const owned = this.#definitions.get(reference.name)
			if (
				owned === undefined ||
				owned.definition.kind === (mode === 'input' ? 'object' : 'input-object')
			) {
				throw new TypeError(
					`GraphQL binding type reference ${reference.name} is unavailable as ${mode}`,
				)
			}
			if (visited.has(reference.name)) return
			visited.add(reference.name)
			if (owned.definition.kind === 'enum') return
			for (const field of owned.definition.fields) visit(field.type, mode)
		}
		for (const { mode, reference } of this.#references) visit(reference, mode)
		for (const name of this.#definitions.keys()) {
			if (!visited.has(name)) {
				throw new TypeError(
					`GraphQL binding supporting type ${name} is unreachable`,
				)
			}
		}
		for (const { definition } of this.#definitions.values()) {
			this.#types.set(
				definition.name,
				this.#ctx.add('bindings', this.#createType(definition)),
			)
		}
	}

	#createType(
		definition: GraphqlOperationSupportingTypeDefinition,
	): GraphQLNamedType {
		const { name } = definition
		if (definition.kind === 'enum') {
			return new GraphQLEnumType({
				name,
				values: Object.fromEntries(
					definition.values.map((value) => [value, { value }]),
				),
			})
		}
		if (definition.kind === 'object') {
			return new GraphQLObjectType({
				name,
				fields: () =>
					Object.fromEntries(
						definition.fields.map((field) => [
							field.name,
							{ type: this.outputType(field.type) },
						]),
					),
			})
		}
		return new GraphQLInputObjectType({
			name,
			fields: () => {
				const schema = this.#createFieldsSchema(definition)
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
			},
		})
	}

	#createFieldsSchema(
		definition: InputObjectDefinition,
	): SchemaDefinition | undefined {
		return definition.createFieldsFrom === undefined
			? undefined
			: this.#ctx.schemas.get(definition.createFieldsFrom)
	}

	#assertDefinitionFields(
		definition: GraphqlOperationSupportingTypeDefinition,
		owner: PluginSchemaContributionOwner,
	): void {
		const names = new Set<string>()
		if (definition.kind === 'enum') {
			for (const value of definition.values) {
				if (!isGraphqlName(value) || names.has(value)) {
					throw new GraphqlSchemaCompilationError(
						'invalid-name',
						`Invalid or duplicate GraphQL enum value "${value}" in ${definition.name}`,
						{ owner, path: `${definition.name}.${value}` },
					)
				}
				names.add(value)
			}
			return
		}
		if (
			definition.kind === 'input-object' &&
			definition.createFieldsFrom !== undefined
		) {
			// Only the binding owner's own schema may lend its create fields.
			const schema = this.#createFieldsSchema(definition)
			const schemaOwner = schema?.definition.provenance.schema.owner
			if (
				schema === undefined ||
				schemaOwner?.kind !== 'plugin' ||
				!isSameBindingOwner(schemaOwner, owner)
			) {
				throw new TypeError(
					`GraphQL binding ${definition.name} cannot use create fields from ${definition.createFieldsFrom}`,
				)
			}
			for (const name of Object.keys(
				this.#inputs.createInput(schema)?.getFields() ?? {},
			)) {
				names.add(name)
			}
		}
		for (const field of definition.fields) {
			assertGraphqlFieldName(
				field.name,
				`binding type ${definition.name}`,
				owner,
			)
			if (names.has(field.name)) {
				throw new GraphqlSchemaCompilationError(
					'name-collision',
					`GraphQL binding type ${definition.name} repeats field ${field.name}`,
					{ owner, path: `${definition.name}.${field.name}` },
				)
			}
			names.add(field.name)
		}
	}

	#named(name: string): GraphQLNamedType {
		const type = readGraphqlBuiltInType(name) ?? this.#types.get(name)
		if (type === undefined) {
			throw new TypeError(`Unknown GraphQL binding type ${name}`)
		}
		return type
	}

	inputType(reference: GraphqlOperationTypeReference): GraphQLInputType {
		return reference.kind === 'non-null'
			? new GraphQLNonNull(this.#nullableInput(reference.ofType))
			: this.#nullableInput(reference)
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
		const type = this.#named(reference.name)
		if (isInputObjectType(type) || isEnumType(type) || isScalarType(type)) {
			return type
		}
		throw new TypeError(
			`GraphQL binding input type ${reference.name} is invalid`,
		)
	}

	outputType(reference: GraphqlOperationTypeReference): GraphQLOutputType {
		return reference.kind === 'non-null'
			? new GraphQLNonNull(this.#nullableOutput(reference.ofType))
			: this.#nullableOutput(reference)
	}

	#nullableOutput(
		reference: GraphqlOperationNullableTypeReference,
	): GraphQLNullableOutputType {
		if (reference.kind === 'list') {
			return new GraphQLList(this.outputType(reference.ofType))
		}
		if (reference.kind === 'schema') {
			const schema = this.#ctx.schemas.get(reference.className)
			if (schema === undefined) {
				throw new TypeError(
					`Unknown GraphQL binding schema ${reference.className}`,
				)
			}
			return this.#fields.model(schema)
		}
		const type = this.#named(reference.name)
		if (isObjectType(type) || isEnumType(type) || isScalarType(type)) {
			return type
		}
		throw new TypeError(
			`GraphQL binding output type ${reference.name} is invalid`,
		)
	}

	/** Applies existing schema codecs without executing validation or defaults twice. */
	decodeInput(
		reference: GraphqlOperationTypeReference,
		value: unknown,
	): unknown {
		if (value === null || value === undefined) return value
		if (reference.kind === 'non-null') {
			return this.decodeInput(reference.ofType, value)
		}
		if (reference.kind === 'list') {
			return Array.isArray(value)
				? value.map((item: unknown) => this.decodeInput(reference.ofType, item))
				: value
		}
		if (reference.kind !== 'named' || !isPlainRecord(value)) return value
		const owned = this.#definitions.get(reference.name)
		if (owned?.definition.kind !== 'input-object') return value
		const definition = owned.definition
		const schema = this.#createFieldsSchema(definition)
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
}

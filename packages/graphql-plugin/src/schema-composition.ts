import type { ApplicationCallbackExecutor } from '@ultimabase/core'
import {
	GraphQLDirective,
	GraphQLEnumType,
	GraphQLInputObjectType,
	GraphQLInterfaceType,
	GraphQLList,
	GraphQLNonNull,
	GraphQLObjectType,
	GraphQLScalarType,
	GraphQLSchema,
	GraphQLUnionType,
	isEnumType,
	isInputObjectType,
	isInterfaceType,
	isListType,
	isNonNullType,
	isObjectType,
	isScalarType,
	isUnionType,
	specifiedDirectives,
	validateSchema,
	type GraphQLInputType,
	type GraphQLNullableInputType,
	type GraphQLNullableOutputType,
	type GraphQLNamedType,
	type GraphQLOutputType,
} from 'graphql'

import { GraphqlSchemaCompilationError } from './errors.js'
import {
	attributedFieldResolver,
	attributedIsTypeOf,
	attributedScalarLiteralParser,
	attributedScalarSerializer,
	attributedScalarValueParser,
	attributedTypeResolver,
} from './schema-resolver-attribution.js'
import {
	preflightGraphqlSchemas,
	type GraphqlCompositionTypeEntry as TypeEntry,
	type GraphqlCompositionTypeGroup as TypeGroup,
} from './schema-composition-preflight.js'
import type { GraphqlSchemaCompositionContext } from './schema-composition-types.js'

class GraphqlSchemaComposer {
	readonly #callbacks: ApplicationCallbackExecutor
	readonly #directives: readonly GraphQLDirective[]
	readonly #groups: ReadonlyMap<string, TypeGroup>
	readonly #mapped = new Map<GraphQLNamedType, GraphQLNamedType>()
	readonly #sourceGroups: ReadonlyMap<GraphQLNamedType, TypeGroup>

	constructor(context: GraphqlSchemaCompositionContext) {
		this.#callbacks = context.callbacks
		const preflight = preflightGraphqlSchemas(context.schemas)
		this.#directives = preflight.directives
		this.#groups = preflight.groups
		this.#sourceGroups = preflight.sourceGroups
	}

	#type(type: GraphQLNamedType): GraphQLNamedType {
		const existing = this.#mapped.get(type)
		if (existing !== undefined) return existing
		const group = this.#sourceGroups.get(type)
		if (group === undefined) return type
		return this.#create(group)
	}

	#input(type: GraphQLInputType): GraphQLInputType {
		if (isNonNullType(type))
			return new GraphQLNonNull(
				this.#input(type.ofType) as GraphQLNullableInputType,
			)
		if (isListType(type)) return new GraphQLList(this.#input(type.ofType))
		return this.#type(type) as GraphQLInputType
	}

	#output(type: GraphQLOutputType): GraphQLOutputType {
		if (isNonNullType(type))
			return new GraphQLNonNull(
				this.#output(type.ofType) as GraphQLNullableOutputType,
			)
		if (isListType(type)) return new GraphQLList(this.#output(type.ofType))
		return this.#type(type) as GraphQLOutputType
	}

	#create(group: TypeGroup): GraphQLNamedType {
		const first = group.entries[0]
		if (first === undefined) throw new TypeError('GraphQL type group is empty')
		const placeholder = this.#mapped.get(first.type)
		if (placeholder !== undefined) return placeholder
		let created: GraphQLNamedType
		if (isObjectType(first.type)) created = this.#object(group, first)
		else if (isInterfaceType(first.type))
			created = this.#interface(group, first)
		else if (isInputObjectType(first.type))
			created = this.#inputObject(group, first)
		else if (isEnumType(first.type)) created = this.#enum(group, first)
		else if (isUnionType(first.type)) created = this.#union(group, first)
		else if (isScalarType(first.type)) created = this.#scalar(group, first)
		else throw new TypeError(`Unsupported GraphQL type ${group.name}`)
		for (const entry of group.entries) this.#mapped.set(entry.type, created)
		return created
	}

	#object(group: TypeGroup, first: TypeEntry): GraphQLObjectType {
		const initial = first.type as GraphQLObjectType
		const config = initial.toConfig()
		return new GraphQLObjectType({
			...config,
			name: group.name,
			interfaces: () => {
				const found = new Map<string, GraphQLInterfaceType>()
				for (const entry of group.entries) {
					for (const item of (entry.type as GraphQLObjectType).toConfig()
						.interfaces) {
						const mapped = this.#type(item) as GraphQLInterfaceType
						found.set(mapped.name, mapped)
					}
				}
				return [...found.values()]
			},
			fields: () =>
				Object.fromEntries(
					group.entries.flatMap((entry) =>
						Object.entries(
							(entry.type as GraphQLObjectType).toConfig().fields,
						).map(
							([name, field]) =>
								[
									name,
									{
										...field,
										type: this.#output(field.type),
										args: Object.fromEntries(
											Object.entries(field.args).map(
												([argumentName, argument]) => [
													argumentName,
													{ ...argument, type: this.#input(argument.type) },
												],
											),
										),
										...(field.resolve === undefined
											? {}
											: {
													resolve: attributedFieldResolver(
														field.resolve,
														entry.source,
														this.#callbacks,
													),
												}),
										...(field.subscribe === undefined
											? {}
											: {
													subscribe: attributedFieldResolver(
														field.subscribe,
														entry.source,
														this.#callbacks,
													),
												}),
									},
								] as const,
						),
					),
				),
			...(config.isTypeOf == null
				? {}
				: {
						isTypeOf: attributedIsTypeOf(
							config.isTypeOf,
							first.source,
							this.#callbacks,
						),
					}),
		})
	}

	#interface(group: TypeGroup, first: TypeEntry): GraphQLInterfaceType {
		const config = (first.type as GraphQLInterfaceType).toConfig()
		return new GraphQLInterfaceType({
			...config,
			name: group.name,
			interfaces: () => {
				const found = new Map<string, GraphQLInterfaceType>()
				for (const entry of group.entries) {
					for (const item of (entry.type as GraphQLInterfaceType).toConfig()
						.interfaces) {
						const mapped = this.#type(item) as GraphQLInterfaceType
						found.set(mapped.name, mapped)
					}
				}
				return [...found.values()]
			},
			fields: () =>
				Object.fromEntries(
					group.entries.flatMap((entry) =>
						Object.entries(
							(entry.type as GraphQLInterfaceType).toConfig().fields,
						).map(
							([name, field]) =>
								[
									name,
									{
										...field,
										type: this.#output(field.type),
										args: Object.fromEntries(
											Object.entries(field.args).map(
												([argumentName, argument]) => [
													argumentName,
													{ ...argument, type: this.#input(argument.type) },
												],
											),
										),
										...(field.resolve === undefined
											? {}
											: {
													resolve: attributedFieldResolver(
														field.resolve,
														entry.source,
														this.#callbacks,
													),
												}),
									},
								] as const,
						),
					),
				),
			...(config.resolveType == null
				? {}
				: {
						resolveType: attributedTypeResolver(
							config.resolveType,
							first.source,
							this.#callbacks,
						),
					}),
		})
	}

	#inputObject(group: TypeGroup, first: TypeEntry): GraphQLInputObjectType {
		const config = (first.type as GraphQLInputObjectType).toConfig()
		return new GraphQLInputObjectType({
			...config,
			name: group.name,
			fields: () =>
				Object.fromEntries(
					group.entries.flatMap((entry) =>
						Object.entries(
							(entry.type as GraphQLInputObjectType).toConfig().fields,
						).map(
							([name, field]) =>
								[name, { ...field, type: this.#input(field.type) }] as const,
						),
					),
				),
		})
	}

	#enum(group: TypeGroup, first: TypeEntry): GraphQLEnumType {
		const config = (first.type as GraphQLEnumType).toConfig()
		return new GraphQLEnumType({
			...config,
			name: group.name,
			values: Object.fromEntries(
				group.entries.flatMap((entry) =>
					Object.entries((entry.type as GraphQLEnumType).toConfig().values),
				),
			),
		})
	}

	#union(group: TypeGroup, first: TypeEntry): GraphQLUnionType {
		const config = (first.type as GraphQLUnionType).toConfig()
		return new GraphQLUnionType({
			...config,
			name: group.name,
			types: () =>
				group.entries.flatMap((entry) =>
					(entry.type as GraphQLUnionType)
						.toConfig()
						.types.map((type) => this.#type(type) as GraphQLObjectType),
				),
			...(config.resolveType == null
				? {}
				: {
						resolveType: attributedTypeResolver(
							config.resolveType,
							first.source,
							this.#callbacks,
						),
					}),
		})
	}

	#scalar(group: TypeGroup, first: TypeEntry): GraphQLScalarType {
		const config = (first.type as GraphQLScalarType).toConfig()
		return new GraphQLScalarType({
			...config,
			name: group.name,
			coerceOutputValue: attributedScalarSerializer(
				config.coerceOutputValue,
				first.source,
				this.#callbacks,
			),
			coerceInputValue: attributedScalarValueParser(
				config.coerceInputValue,
				first.source,
				this.#callbacks,
			),
			...(config.coerceInputLiteral === undefined
				? {}
				: {
						coerceInputLiteral: attributedScalarLiteralParser(
							config.coerceInputLiteral,
							first.source,
							this.#callbacks,
						),
					}),
		})
	}

	compose(): GraphQLSchema {
		const type = (key: string): GraphQLObjectType | undefined => {
			const group = this.#groups.get(key)
			return group === undefined
				? undefined
				: (this.#create(group) as GraphQLObjectType)
		}
		const directives = this.#directives.map((directive) => {
			const config = directive.toConfig()
			return new GraphQLDirective({
				...config,
				args: Object.fromEntries(
					Object.entries(config.args).map(([name, argument]) => [
						name,
						{ ...argument, type: this.#input(argument.type) },
					]),
				),
			})
		})
		const roots = new Set(['@query', '@mutation', '@subscription'])
		const schema = new GraphQLSchema({
			query: type('@query'),
			mutation: type('@mutation'),
			subscription: type('@subscription'),
			directives: [...specifiedDirectives, ...directives],
			types: [...this.#groups.values()]
				.filter(({ key }) => !roots.has(key))
				.map((group) => this.#create(group)),
		})
		if (Object.keys(schema.getQueryType()?.getFields() ?? {}).length === 0) {
			throw new GraphqlSchemaCompilationError(
				'missing-query-root',
				'GraphQL schema compilation requires at least one public query field',
			)
		}
		const errors = validateSchema(schema)
		if (errors.length > 0) {
			throw new GraphqlSchemaCompilationError(
				errors[0]?.message.includes('Query root type must be provided') ===
					true ||
					Object.keys(schema.getQueryType()?.getFields() ?? {}).length === 0
					? 'missing-query-root'
					: 'name-collision',
				`Invalid composed GraphQL schema: ${errors[0]?.message ?? 'unknown validation failure'}`,
			)
		}
		return schema
	}
}

/** Clones and deterministically merges generated and contributed schemas. */
export const composeGraphqlSchemas = (
	context: GraphqlSchemaCompositionContext,
): GraphQLSchema => new GraphqlSchemaComposer(context).compose()

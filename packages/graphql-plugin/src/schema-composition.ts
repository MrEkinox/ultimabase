import type { ApplicationCallbackExecutor } from '@ultimabase/core'
import { rewireTypes } from '@graphql-tools/utils'
import {
	assertNamedType,
	assertObjectType,
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
	type GraphQLDirective,
	type GraphQLFieldConfigMap,
	type GraphQLNamedType,
	type GraphQLType,
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
	readonly #roots = new Map<GraphQLNamedType, GraphQLObjectType>()

	constructor(context: GraphqlSchemaCompositionContext) {
		this.#callbacks = context.callbacks
		const preflight = preflightGraphqlSchemas(context.schemas)
		this.#directives = preflight.directives
		this.#groups = preflight.groups
		for (const group of this.#groups.values()) {
			if (!group.key.startsWith('@')) continue
			// Root aliases are identity-based: another schema may own a named type
			// with the same original name. Tools rewires these inert references later.
			const root = new GraphQLObjectType({ name: group.name, fields: {} })
			for (const entry of group.entries) this.#roots.set(entry.type, root)
		}
	}

	#reference<TType extends GraphQLType>(type: TType): TType {
		if (isNonNullType(type))
			return new GraphQLNonNull(this.#reference(type.ofType)) as TType
		if (isListType(type))
			return new GraphQLList(this.#reference(type.ofType)) as TType
		return (this.#roots.get(type) ?? type) as TType
	}

	#fields(group: TypeGroup): GraphQLFieldConfigMap<unknown, unknown> {
		return Object.fromEntries(
			group.entries.flatMap((entry) =>
				Object.entries(
					(entry.type as GraphQLObjectType | GraphQLInterfaceType).toConfig()
						.fields,
				).map(([name, field]) => [
					name,
					{
						...field,
						type: this.#reference(field.type),
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
				]),
			),
		)
	}

	#interfaces(group: TypeGroup): GraphQLInterfaceType[] {
		return [
			...new Map(
				group.entries.flatMap((entry) =>
					(entry.type as GraphQLObjectType | GraphQLInterfaceType)
						.toConfig()
						.interfaces.map((type) => [type.name, type] as const),
				),
			).values(),
		]
	}

	#create(group: TypeGroup): GraphQLNamedType {
		const first = group.entries[0]
		if (first === undefined) throw new TypeError('GraphQL type group is empty')
		if (isObjectType(first.type)) {
			const config = first.type.toConfig()
			return new GraphQLObjectType({
				...config,
				name: group.name,
				interfaces: () => this.#interfaces(group),
				fields: () => this.#fields(group),
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
		if (isInterfaceType(first.type) || isUnionType(first.type)) {
			const config = first.type.toConfig()
			const attribution = {
				...(config.resolveType == null
					? {}
					: {
							resolveType: attributedTypeResolver(
								config.resolveType,
								first.source,
								this.#callbacks,
							),
						}),
			}
			return isInterfaceType(first.type)
				? new GraphQLInterfaceType({
						...first.type.toConfig(),
						...attribution,
						name: group.name,
						interfaces: () => this.#interfaces(group),
						fields: () => this.#fields(group),
					})
				: new GraphQLUnionType({
						...first.type.toConfig(),
						...attribution,
						name: group.name,
						types: () =>
							group.entries.flatMap((entry) =>
								(entry.type as GraphQLUnionType)
									.toConfig()
									.types.map((type) => this.#reference(type)),
							),
					})
		}
		if (isInputObjectType(first.type))
			return new GraphQLInputObjectType({
				...first.type.toConfig(),
				name: group.name,
				fields: () =>
					Object.fromEntries(
						group.entries.flatMap((entry) =>
							Object.entries(
								(entry.type as GraphQLInputObjectType).toConfig().fields,
							),
						),
					),
			})
		if (isEnumType(first.type))
			return new GraphQLEnumType({
				...first.type.toConfig(),
				name: group.name,
				values: Object.fromEntries(
					group.entries.flatMap((entry) =>
						Object.entries((entry.type as GraphQLEnumType).toConfig().values),
					),
				),
			})
		if (isScalarType(first.type)) return this.#scalar(group, first)
		throw new TypeError(`Unsupported GraphQL type ${group.name}`)
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
		// Preserve ownership/metadata ourselves; Tools only clones and rewires.
		// No intermediate serialization/reparsing of scalar defaults is needed.
		const { typeMap, directives } = rewireTypes(
			Object.fromEntries(
				[...this.#groups.values()].map((group) => [
					group.name,
					this.#create(group),
				]),
			),
			[...specifiedDirectives, ...this.#directives],
		)
		const root = (key: string): GraphQLObjectType | undefined => {
			const group = this.#groups.get(key)
			return group === undefined
				? undefined
				: assertObjectType(typeMap[group.name])
		}
		const roots = new Set(['@query', '@mutation', '@subscription'])
		const schema = new GraphQLSchema({
			query: root('@query'),
			mutation: root('@mutation'),
			subscription: root('@subscription'),
			directives,
			types: [...this.#groups.values()]
				.filter(({ key }) => !roots.has(key))
				.map((group) => assertNamedType(typeMap[group.name])),
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

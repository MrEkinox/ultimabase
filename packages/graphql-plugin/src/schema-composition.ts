import type { Logger } from '@ultimabase/core'
import {
	getCurrentRequest,
	type ApplicationCallbackExecutor,
} from '@ultimabase/core'
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
	type GraphQLFieldConfig,
	type GraphQLFieldConfigMap,
	type GraphQLInterfaceType as InterfaceType,
	type GraphQLNamedType,
	type GraphQLNullableOutputType,
	type GraphQLOutputType,
} from 'graphql'

import { GraphqlSchemaCompilationError } from './errors.js'
import { createSafeGraphqlError } from './execution-errors.js'
import {
	preflightGraphqlSchemas,
	type GraphqlCompositionTypeGroup as TypeGroup,
	type GraphqlSchemaCompositionContext,
	type OwnedGraphqlSchema,
} from './schema-composition-preflight.js'

const requestIdOf = (context: unknown): string => {
	if (typeof context !== 'object' || context === null) return 'unavailable'
	const request: unknown = Reflect.get(context, 'request')
	if (typeof request !== 'object' || request === null) return 'unavailable'
	const value: unknown = Reflect.get(request, 'requestId')
	return typeof value === 'string' ? value : 'unavailable'
}

const currentRequestId = (): string => {
	try {
		return getCurrentRequest().requestId
	} catch {
		return 'unavailable'
	}
}

/** Clones and deterministically merges generated and contributed schemas. */
class GraphqlSchemaComposer {
	readonly #callbacks: ApplicationCallbackExecutor
	readonly #logger: Logger
	readonly #directives: readonly GraphQLDirective[]
	readonly #groups: ReadonlyMap<string, TypeGroup>
	readonly #roots = new Map<GraphQLObjectType, GraphQLObjectType>()

	constructor(context: GraphqlSchemaCompositionContext) {
		this.#callbacks = context.callbacks
		this.#logger = context.logger
		const preflight = preflightGraphqlSchemas(context.schemas)
		this.#directives = preflight.directives
		this.#groups = preflight.groups
		for (const group of this.#groups.values()) {
			if (!group.key.startsWith('@')) continue
			// Root aliases are identity-based: another schema may own a named type
			// with the same original name. Tools rewires these inert references later.
			const root = new GraphQLObjectType({ name: group.name, fields: {} })
			for (const { type } of group.entries) {
				if (isObjectType(type)) this.#roots.set(type, root)
			}
		}
	}

	#run<TResult>(source: OwnedGraphqlSchema, callback: () => TResult): TResult {
		const { attribution } = source
		return attribution.kind === 'application'
			? this.#callbacks.runApplication(callback)
			: attribution.kind === 'plugin'
				? this.#callbacks.runPlugin(attribution.owner, callback)
				: callback()
	}

	// Contributed resolvers run under their owner's authority with masked failures.
	#resolver<TArgs extends readonly unknown[], TResult>(
		resolver: (...args: TArgs) => TResult,
		source: OwnedGraphqlSchema,
		contextIndex: 1 | 2,
	): (...args: TArgs) => TResult | Promise<Awaited<TResult>> {
		if (source.attribution.kind === 'generated') return resolver
		return async (...args): Promise<Awaited<TResult>> => {
			try {
				return await this.#run(source, () => resolver(...args))
			} catch (error: unknown) {
				throw createSafeGraphqlError(
					error,
					requestIdOf(args[contextIndex]),
					this.#logger,
				)
			}
		}
	}

	// Scalar coercion is synchronous and has no context, so the active request names it.
	#scalarCallback<TArgs extends readonly unknown[], TResult>(
		callback: (...args: TArgs) => TResult,
		source: OwnedGraphqlSchema,
	): (...args: TArgs) => TResult {
		if (source.attribution.kind === 'generated') return callback
		return (...args) => {
			try {
				return this.#run(source, () => callback(...args))
			} catch (error: unknown) {
				throw createSafeGraphqlError(error, currentRequestId(), this.#logger)
			}
		}
	}

	#outputType(type: GraphQLOutputType): GraphQLOutputType {
		return isNonNullType(type)
			? new GraphQLNonNull(this.#nullableOutputType(type.ofType))
			: this.#nullableOutputType(type)
	}

	#nullableOutputType(
		type: GraphQLNullableOutputType,
	): GraphQLNullableOutputType {
		if (isListType(type)) return new GraphQLList(this.#outputType(type.ofType))
		return isObjectType(type) ? this.#object(type) : type
	}

	#object(type: GraphQLObjectType): GraphQLObjectType {
		return this.#roots.get(type) ?? type
	}

	#field(
		field: GraphQLFieldConfig<unknown, unknown>,
		source: OwnedGraphqlSchema,
	): GraphQLFieldConfig<unknown, unknown> {
		return {
			...field,
			type: this.#outputType(field.type),
			...(field.resolve === undefined
				? {}
				: { resolve: this.#resolver(field.resolve, source, 2) }),
			...(field.subscribe === undefined
				? {}
				: { subscribe: this.#resolver(field.subscribe, source, 2) }),
		}
	}

	// Preflight proved that every entry of a group has the kind of its first entry.
	#fields(group: TypeGroup): GraphQLFieldConfigMap<unknown, unknown> {
		return Object.fromEntries(
			group.entries.flatMap(({ source, type }) =>
				isObjectType(type) || isInterfaceType(type)
					? Object.entries(type.toConfig().fields).map(
							([name, field]) => [name, this.#field(field, source)] as const,
						)
					: [],
			),
		)
	}

	#interfaces(group: TypeGroup): InterfaceType[] {
		return [
			...new Map(
				group.entries.flatMap(({ type }) =>
					isObjectType(type) || isInterfaceType(type)
						? type
								.toConfig()
								.interfaces.map((item) => [item.name, item] as const)
						: [],
				),
			).values(),
		]
	}

	#create(group: TypeGroup): GraphQLNamedType {
		const first = group.entries[0]
		if (first === undefined) throw new TypeError('GraphQL type group is empty')
		const { name } = group
		const { source, type } = first
		if (isObjectType(type)) {
			const config = type.toConfig()
			return new GraphQLObjectType({
				...config,
				name,
				interfaces: () => this.#interfaces(group),
				fields: () => this.#fields(group),
				...(config.isTypeOf == null
					? {}
					: { isTypeOf: this.#resolver(config.isTypeOf, source, 1) }),
			})
		}
		if (isInterfaceType(type) || isUnionType(type)) {
			const config = type.toConfig()
			const resolveType =
				config.resolveType == null
					? {}
					: { resolveType: this.#resolver(config.resolveType, source, 1) }
			return isInterfaceType(type)
				? new GraphQLInterfaceType({
						...type.toConfig(),
						...resolveType,
						name,
						interfaces: () => this.#interfaces(group),
						fields: () => this.#fields(group),
					})
				: new GraphQLUnionType({
						...type.toConfig(),
						...resolveType,
						name,
						types: () =>
							group.entries.flatMap((entry) =>
								isUnionType(entry.type)
									? entry.type
											.toConfig()
											.types.map((member) => this.#object(member))
									: [],
							),
					})
		}
		if (isInputObjectType(type)) {
			return new GraphQLInputObjectType({
				...type.toConfig(),
				name,
				fields: () =>
					Object.fromEntries(
						group.entries.flatMap((entry) =>
							isInputObjectType(entry.type)
								? Object.entries(entry.type.toConfig().fields)
								: [],
						),
					),
			})
		}
		if (isEnumType(type)) {
			return new GraphQLEnumType({
				...type.toConfig(),
				name,
				values: Object.fromEntries(
					group.entries.flatMap((entry) =>
						isEnumType(entry.type)
							? Object.entries(entry.type.toConfig().values)
							: [],
					),
				),
			})
		}
		if (isScalarType(type)) {
			const config = type.toConfig()
			return new GraphQLScalarType({
				...config,
				name,
				coerceOutputValue: this.#scalarCallback(
					config.coerceOutputValue,
					source,
				),
				coerceInputValue: this.#scalarCallback(config.coerceInputValue, source),
				...(config.coerceInputLiteral === undefined
					? {}
					: {
							coerceInputLiteral: this.#scalarCallback(
								config.coerceInputLiteral,
								source,
							),
						}),
			})
		}
		throw new TypeError(`Unsupported GraphQL type ${name}`)
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
		const schema = new GraphQLSchema({
			query: root('@query'),
			mutation: root('@mutation'),
			directives,
			types: [...this.#groups.values()]
				.filter(({ key }) => !key.startsWith('@'))
				.map((group) => assertNamedType(typeMap[group.name])),
		})
		const queryFieldCount = Object.keys(
			schema.getQueryType()?.getFields() ?? {},
		).length
		if (queryFieldCount === 0) {
			throw new GraphqlSchemaCompilationError(
				'missing-query-root',
				'GraphQL schema compilation requires at least one public query field',
			)
		}
		const [error] = validateSchema(schema)
		if (error !== undefined) {
			throw new GraphqlSchemaCompilationError(
				error.message.includes('Query root type must be provided')
					? 'missing-query-root'
					: 'name-collision',
				`Invalid composed GraphQL schema: ${error.message}`,
			)
		}
		return schema
	}
}

/** Clones and deterministically merges generated and contributed schemas. */
export const composeGraphqlSchemas = (
	context: GraphqlSchemaCompositionContext,
): GraphQLSchema => new GraphqlSchemaComposer(context).compose()

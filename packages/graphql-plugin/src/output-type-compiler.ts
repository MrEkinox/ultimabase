import type {
	GenericOutputDescriptor,
	OutputFields,
	SchemaDefinition,
} from '@ultimabase/core'
import { isPlainRecord } from '@ultimabase/shared'
import {
	GraphQLBoolean,
	GraphQLEnumType,
	GraphQLNonNull,
	GraphQLObjectType,
	GraphQLString,
	type GraphQLFieldConfigMap,
	type GraphQLFieldResolver,
	type GraphQLNullableOutputType,
	type GraphQLOutputType,
} from 'graphql'

import {
	assertSchemaFieldName,
	graphqlEnumValueName,
	graphqlFieldOwner,
	graphqlFieldTypeSegment,
	graphqlSourceDescription,
	memoize,
	nonNullList,
	readGraphqlEnumValues,
	readGraphqlSharedEnum,
	type GraphqlCompileContext,
} from './compile-context.js'
import { GraphqlSchemaCompilationError } from './errors.js'
import { readGraphqlScalarType } from './scalar-types.js'
import { GraphqlSafeInt } from './scalars.js'

interface NamedOutputType {
	readonly signature: string
	readonly source: string
	readonly type: GraphQLEnumType | GraphQLObjectType
}

const readOutputFields = (
	descriptor: GenericOutputDescriptor,
	path: string,
): OutputFields => {
	const fields: unknown = Reflect.get(descriptor.options, 'fields')
	if (!isPlainRecord(fields)) {
		throw new TypeError(`${path} requires output object fields`)
	}
	// Core validates every output object property as a descriptor.
	return fields as OutputFields
}

const readTypeName = (
	descriptor: GenericOutputDescriptor,
): string | undefined => {
	const typeName: unknown = Reflect.get(descriptor.options, 'typeName')
	return typeof typeName === 'string' ? typeName : undefined
}

// Two declarations may share one explicit name only with an identical shape.
const outputShapeSignature = (descriptor: GenericOutputDescriptor): string => {
	const common = `${descriptor.kind}:${String(descriptor.options.list)}:${String(descriptor.options.nullable)}`
	if (descriptor.kind === 'enum') {
		return `${common}:${readTypeName(descriptor) ?? ''}:${JSON.stringify(readGraphqlEnumValues(descriptor.options))}`
	}
	if (descriptor.kind !== 'object') return common
	const fields = Object.entries(
		readOutputFields(descriptor, descriptor.kind),
	).map(([name, child]) => [name, outputShapeSignature(child)])
	return `${common}:${readTypeName(descriptor) ?? ''}:${JSON.stringify(fields)}`
}

const describe = (schema: SchemaDefinition, path: readonly string[]): string =>
	`${schema.className}.${path.join('.')}`

/** Compiles output-only virtual and Relay types without installing resolvers. */
export class GraphqlOutputTypeCompiler {
	readonly #ctx: GraphqlCompileContext
	readonly #model: (schema: SchemaDefinition) => GraphQLObjectType
	readonly #totalCount: GraphQLFieldResolver<unknown, unknown>
	readonly #named = new Map<string, NamedOutputType>()
	readonly #connections = new Map<SchemaDefinition, GraphQLObjectType>()
	readonly #edges = new Map<SchemaDefinition, GraphQLObjectType>()
	#pageInfo: GraphQLObjectType | undefined

	constructor(
		ctx: GraphqlCompileContext,
		model: (schema: SchemaDefinition) => GraphQLObjectType,
		totalCount: GraphQLFieldResolver<unknown, unknown>,
	) {
		this.#ctx = ctx
		this.#model = model
		this.#totalCount = totalCount
	}

	/**
	 * Builds the Relay connection type of one schema; `totalCount` exists only
	 * when `count` is enabled for it (ADR-0325).
	 */
	connection(schema: SchemaDefinition): GraphQLObjectType {
		return memoize(this.#connections, schema, () => {
			const name = `${this.#ctx.typeName(schema)}Connection`
			this.#ctx.claim(name, schema)
			const surface = this.#ctx.surface(schema)
			if (!surface.count && surface.owner.kind === 'application') {
				this.#ctx.hints.add(name, 'totalCount', 'count', schema.className)
			}
			return this.#ctx.add(
				'connections',
				new GraphQLObjectType({
					name,
					fields: () => ({
						edges: {
							type: new GraphQLNonNull(nonNullList(this.#edge(schema))),
						},
						nodes: {
							type: new GraphQLNonNull(nonNullList(this.#model(schema))),
						},
						pageInfo: { type: new GraphQLNonNull(this.#pageInfoType()) },
						...(surface.count
							? {
									totalCount: {
										description:
											'Number of rows matching `where`, ignoring `first` and `after`.',
										resolve: this.#totalCount,
										type: new GraphQLNonNull(GraphqlSafeInt),
									},
								}
							: {}),
					}),
				}),
			)
		})
	}

	#edge(schema: SchemaDefinition): GraphQLObjectType {
		return memoize(this.#edges, schema, () => {
			const name = `${this.#ctx.typeName(schema)}Edge`
			this.#ctx.claim(name, schema)
			return this.#ctx.add(
				'connections',
				new GraphQLObjectType({
					name,
					fields: () => ({
						cursor: { type: new GraphQLNonNull(GraphQLString) },
						node: { type: new GraphQLNonNull(this.#model(schema)) },
					}),
				}),
			)
		})
	}

	#pageInfoType(): GraphQLObjectType {
		if (this.#pageInfo !== undefined) return this.#pageInfo
		this.#ctx.names.claimType('PageInfo', 'reserved Relay page information')
		this.#pageInfo = this.#ctx.add(
			'connections',
			new GraphQLObjectType({
				name: 'PageInfo',
				fields: {
					hasNextPage: { type: new GraphQLNonNull(GraphQLBoolean) },
					hasPreviousPage: { type: new GraphQLNonNull(GraphQLBoolean) },
					startCursor: { type: GraphQLString },
					endCursor: { type: GraphQLString },
				},
			}),
		)
		return this.#pageInfo
	}

	#assertSupported(
		descriptor: GenericOutputDescriptor,
		schema: SchemaDefinition,
		path: readonly string[],
	): void {
		if (
			descriptor.kind !== 'enum' &&
			descriptor.kind !== 'object' &&
			readGraphqlScalarType(descriptor.kind) === undefined
		) {
			throw new GraphqlSchemaCompilationError(
				'missing-field-codec',
				`Virtual output ${describe(schema, path)} uses ${descriptor.kind} without an exact GraphQL v1 representation`,
				{
					owner: graphqlFieldOwner(schema, path),
					path: describe(schema, path),
				},
			)
		}
		if (descriptor.kind !== 'object') return
		for (const [name, child] of Object.entries(
			readOutputFields(descriptor, describe(schema, path)),
		)) {
			this.#assertSupported(child, schema, [...path, name])
		}
	}

	// Enum and object output names share one cache keyed by the GraphQL name.
	#namedType(
		descriptor: GenericOutputDescriptor,
		schema: SchemaDefinition,
		path: readonly string[],
		modelTypeName: string,
		create: (name: string) => GraphQLEnumType | GraphQLObjectType,
	): GraphQLEnumType | GraphQLObjectType {
		const name =
			readTypeName(descriptor) ??
			readGraphqlSharedEnum(descriptor.options)?.name ??
			`${modelTypeName}${path.map(graphqlFieldTypeSegment).join('')}`
		const signature = outputShapeSignature(descriptor)
		const source = graphqlSourceDescription(schema, path)
		const existing = this.#named.get(`${descriptor.kind}:${name}`)
		if (existing !== undefined) {
			if (existing.signature !== signature) {
				throw new GraphqlSchemaCompilationError(
					'name-collision',
					`GraphQL output type "${name}" from ${source} conflicts with ${existing.source}`,
					{
						owner: graphqlFieldOwner(schema, path),
						path: describe(schema, path),
					},
				)
			}
			return existing.type
		}
		this.#ctx.names.claimType(name, source, graphqlFieldOwner(schema, path))
		const type = this.#ctx.add('outputs', create(name))
		this.#named.set(`${descriptor.kind}:${name}`, { signature, source, type })
		return type
	}

	#objectFields(
		fields: OutputFields,
		schema: SchemaDefinition,
		parentPath: readonly string[],
		modelTypeName: string,
	): GraphQLFieldConfigMap<unknown, unknown> {
		return Object.fromEntries(
			Object.entries(fields).map(([name, descriptor]) => {
				const path = [...parentPath, name]
				assertSchemaFieldName(schema, path)
				return [
					name,
					{
						description: descriptor.options.description,
						type: this.output(descriptor, schema, path, modelTypeName),
					},
				] as const
			}),
		)
	}

	output(
		descriptor: GenericOutputDescriptor,
		schema: SchemaDefinition,
		path: readonly string[],
		modelTypeName: string,
	): GraphQLOutputType {
		this.#assertSupported(descriptor, schema, path)
		const shared =
			descriptor.kind === 'enum'
				? readGraphqlSharedEnum(descriptor.options)
				: undefined
		const element =
			readGraphqlScalarType(descriptor.kind) ??
			(shared === undefined
				? undefined
				: this.#ctx.sharedEnum(
						shared.name,
						() => {
							this.#ctx.names.claimType(
								shared.name,
								graphqlSourceDescription(schema, path),
								graphqlFieldOwner(schema, path),
							)
						},
						() =>
							new GraphQLEnumType({
								name: shared.name,
								values: Object.fromEntries(
									shared.values.map((value) => [
										graphqlEnumValueName(value),
										{ value },
									]),
								),
							}),
					)) ??
			this.#namedType(descriptor, schema, path, modelTypeName, (name) => {
				if (descriptor.kind === 'enum') {
					return new GraphQLEnumType({
						name,
						values: Object.fromEntries(
							readGraphqlEnumValues(descriptor.options).map((value) => [
								graphqlEnumValueName(value),
								{ value },
							]),
						),
					})
				}
				const fields = readOutputFields(descriptor, describe(schema, path))
				return new GraphQLObjectType({
					name,
					fields: () => this.#objectFields(fields, schema, path, modelTypeName),
				})
			})
		const value: GraphQLNullableOutputType = descriptor.options.list
			? nonNullList(element)
			: element
		return descriptor.options.nullable ? value : new GraphQLNonNull(value)
	}
}

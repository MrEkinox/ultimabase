import {
	getFieldListDepth,
	type GenericField,
	type SchemaDefinition,
} from '@ultimabase/core'
import {
	GraphQLBoolean,
	GraphQLEnumType,
	GraphQLInputObjectType,
	GraphQLNonNull,
	GraphQLString,
	type GraphQLInputFieldConfigMap,
} from 'graphql'

import {
	fieldPathKey,
	memoize,
	nonNullList,
	readGraphqlObjectFields,
	type GraphqlCompileContext,
} from './compile-context.js'
import type { GraphqlFieldTypeCompiler } from './field-compiler.js'
import { narrowGraphqlOperators } from './declared-operators.js'
import { GraphqlJSON } from './scalars.js'

/** Compiles shared read inputs, recursive JSON paths and embedded partials. */
export class GraphqlStructuralFilterInputCompiler {
	readonly #ctx: GraphqlCompileContext
	readonly #fieldTypes: GraphqlFieldTypeCompiler
	readonly #pathFilters = new Map<string, GraphQLInputObjectType>()
	readonly #partialObjects = new Map<string, GraphQLInputObjectType>()
	#regex: GraphQLInputObjectType | undefined
	#direction: GraphQLEnumType | undefined

	constructor(
		ctx: GraphqlCompileContext,
		fieldTypes: GraphqlFieldTypeCompiler,
	) {
		this.#ctx = ctx
		this.#fieldTypes = fieldTypes
	}

	// Shared read inputs are claimed on first use and listed in creation order.
	#shared<TType>(name: string, create: (name: string) => TType): TType {
		this.#ctx.names.claimType(name, `shared GraphQL read input ${name}`)
		return create(name)
	}

	regex(): GraphQLInputObjectType {
		if (this.#regex !== undefined) return this.#regex
		const flag = this.#shared(
			'GraphqlRegexFlag',
			(name) =>
				new GraphQLEnumType({
					name,
					values: {
						CASE_INSENSITIVE: { value: 'case-insensitive' },
						DOT_MATCHES_NEWLINE: { value: 'dot-matches-newline' },
						MULTILINE: { value: 'multiline' },
					},
				}),
		)
		this.#regex = this.#shared(
			'GraphqlRegexPattern',
			(name) =>
				new GraphQLInputObjectType({
					name,
					fields: {
						flags: { type: new GraphQLNonNull(nonNullList(flag)) },
						source: { type: new GraphQLNonNull(GraphQLString) },
					},
				}),
		)
		this.#ctx.add('filterShared', flag)
		return this.#ctx.add('filterShared', this.#regex)
	}

	direction(): GraphQLEnumType {
		this.#direction ??= this.#ctx.add(
			'filterShared',
			this.#shared(
				'GraphqlOrderDirection',
				(name) =>
					new GraphQLEnumType({
						name,
						values: { ASC: { value: 'asc' }, DESC: { value: 'desc' } },
					}),
			),
		)
		return this.#direction
	}

	pathFilter(
		schema: SchemaDefinition,
		path: readonly string[],
		declared?: ReadonlySet<string>,
	): GraphQLInputObjectType {
		return memoize(this.#pathFilters, fieldPathKey(schema, path), () => {
			const name = `${this.#ctx.typeName(schema, path)}PathWhere`
			this.#ctx.claim(name, schema, path)
			const json = { type: GraphqlJSON }
			const jsonList = { type: nonNullList(GraphqlJSON) }
			const strings = { type: nonNullList(GraphQLString) }
			const fields: GraphQLInputFieldConfigMap = {
				path: { type: new GraphQLNonNull(nonNullList(GraphQLString)) },
				eq: json,
				ne: json,
				in: jsonList,
				notIn: jsonList,
				gt: json,
				gte: json,
				lt: json,
				lte: json,
				between: json,
				notBetween: json,
				has: json,
				hasEvery: jsonList,
				hasSome: jsonList,
				isEmpty: { type: GraphQLBoolean },
				contains: json,
				startsWith: { type: GraphQLString },
				endsWith: { type: GraphQLString },
				matches: { type: this.regex() },
				isNull: { type: GraphQLBoolean },
				isNotNull: { type: GraphQLBoolean },
				hasAllKeys: strings,
				hasAnyKeys: strings,
				hasKey: { type: GraphQLString },
			}
			return this.#ctx.add(
				'structural',
				new GraphQLInputObjectType({
					name,
					fields: narrowGraphqlOperators(fields, declared),
				}),
			)
		})
	}

	partialObject(
		schema: SchemaDefinition,
		field: GenericField,
		path: readonly string[],
	): GraphQLInputObjectType {
		return memoize(this.#partialObjects, fieldPathKey(schema, path), () => {
			const name = `${this.#ctx.typeName(schema, path)}PartialInput`
			this.#ctx.claim(name, schema, path)
			const fields = readGraphqlObjectFields(field)
			return this.#ctx.add(
				'structural',
				new GraphQLInputObjectType({
					name,
					fields: () =>
						Object.fromEntries(
							Object.entries(fields).map(([childName, child]) => {
								const childPath = [...path, childName]
								const type =
									child.kind === 'object' &&
									getFieldListDepth(child.options) === 0
										? this.partialObject(schema, child, childPath)
										: this.#fieldTypes.inputType(child, schema, childPath)
								return [childName, { type }]
							}),
						),
				}),
			)
		})
	}
}

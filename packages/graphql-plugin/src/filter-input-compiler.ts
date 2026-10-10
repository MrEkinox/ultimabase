import {
	getFieldListDepth,
	getPluginFieldStorageCodec,
	getPluginFieldStructuralContains,
	type GenericField,
	type SchemaDefinition,
} from '@ultimabase/core'
import {
	GraphQLBoolean,
	GraphQLEnumType,
	GraphQLID,
	GraphQLInputObjectType,
	GraphQLInt,
	GraphQLNonNull,
	GraphQLString,
	type GraphQLInputFieldConfigMap,
	type GraphQLNullableInputType,
} from 'graphql'

import {
	assertSchemaFieldName,
	fieldPathKey,
	memoize,
	nonNullList,
	type GraphqlCompileContext,
} from './compile-context.js'
import type { GraphqlFieldTypeCompiler } from './field-compiler.js'
import { GraphqlStructuralFilterInputCompiler } from './filter-structural-input-compiler.js'
import { GraphqlJSON } from './scalars.js'
import { isGraphqlBuiltInFieldKind } from './scalar-types.js'

// Mirrors the built-in field kinds accepted by Core equality normalization.
const equalityFieldKinds: ReadonlySet<string> = new Set([
	'bigint',
	'binary',
	'boolean',
	'date',
	'dateTime',
	'decimal',
	'enum',
	'float',
	'int',
	'json',
	'pointer',
	'string',
	'time',
	'uuid',
])

// Mirrors the built-in field kinds accepted by Core ordering comparisons.
const orderedFieldKinds: ReadonlySet<string> = new Set([
	'bigint',
	'date',
	'dateTime',
	'decimal',
	'float',
	'int',
	'string',
	'time',
])

const nullOperators = (): GraphQLInputFieldConfigMap => ({
	isNull: { type: GraphQLBoolean },
	isNotNull: { type: GraphQLBoolean },
})

const equalityOperators = (
	type: GraphQLNullableInputType,
): GraphQLInputFieldConfigMap => ({
	eq: { type },
	in: { type: nonNullList(type) },
	ne: { type },
	notIn: { type: nonNullList(type) },
})

/** Generates schema-aware GraphQL filter and ordering input objects. */
export class GraphqlFilterInputCompiler {
	readonly #ctx: GraphqlCompileContext
	readonly #fieldTypes: GraphqlFieldTypeCompiler
	readonly #whereTypes = new Map<SchemaDefinition, GraphQLInputObjectType>()
	readonly #orders = new Map<SchemaDefinition, GraphQLInputObjectType>()
	readonly #fieldFilters = new Map<string, GraphQLInputObjectType>()
	readonly #structural: GraphqlStructuralFilterInputCompiler

	constructor(
		ctx: GraphqlCompileContext,
		fieldTypes: GraphqlFieldTypeCompiler,
	) {
		this.#ctx = ctx
		this.#fieldTypes = fieldTypes
		this.#structural = new GraphqlStructuralFilterInputCompiler(ctx, fieldTypes)
	}

	#range(
		name: string,
		type: GraphQLNullableInputType,
		schema: SchemaDefinition,
		path: readonly string[],
	): GraphQLInputObjectType {
		const rangeName = `${name}Range`
		this.#ctx.claim(rangeName, schema, path)
		return this.#ctx.add(
			'filters',
			new GraphQLInputObjectType({
				name: rangeName,
				fields: {
					lower: { type: new GraphQLNonNull(type) },
					upper: { type: new GraphQLNonNull(type) },
				},
			}),
		)
	}

	#relationCount(
		schema: SchemaDefinition,
		path: readonly string[],
	): GraphQLInputObjectType {
		const name = `${this.#ctx.typeName(schema, path)}CountWhere`
		this.#ctx.claim(name, schema, path)
		const range = this.#range(name, GraphQLInt, schema, path)
		const target = this.#ctx.target(schema, path)
		return this.#ctx.add(
			'filters',
			new GraphQLInputObjectType({
				name,
				fields: () => ({
					between: { type: range },
					eq: { type: GraphQLInt },
					gt: { type: GraphQLInt },
					gte: { type: GraphQLInt },
					in: { type: nonNullList(GraphQLInt) },
					lt: { type: GraphQLInt },
					lte: { type: GraphQLInt },
					ne: { type: GraphQLInt },
					notBetween: { type: range },
					notIn: { type: nonNullList(GraphQLInt) },
					where: { type: this.where(target) },
				}),
			}),
		)
	}

	#fieldFilter(
		field: GenericField,
		schema: SchemaDefinition,
		path: readonly string[],
	): GraphQLInputObjectType {
		return memoize(this.#fieldFilters, fieldPathKey(schema, path), () => {
			const name = `${this.#ctx.typeName(schema, path)}Where`
			this.#ctx.claim(name, schema, path)
			return this.#ctx.add(
				'filters',
				new GraphQLInputObjectType({
					name,
					fields: () => this.#fieldFilterFields(field, schema, path, name),
				}),
			)
		})
	}

	#fieldFilterFields(
		field: GenericField,
		schema: SchemaDefinition,
		path: readonly string[],
		name: string,
	): GraphQLInputFieldConfigMap {
		if (field.kind === 'pointer') {
			return {
				is: { type: this.where(this.#ctx.target(schema, path)) },
				isNot: { type: this.where(this.#ctx.target(schema, path)) },
				...equalityOperators(GraphQLID),
				...nullOperators(),
			}
		}
		if (field.kind === 'relation') {
			const targetWhere = this.where(this.#ctx.target(schema, path))
			return {
				count: { type: this.#relationCount(schema, path) },
				every: { type: targetWhere },
				isEmpty: { type: GraphQLBoolean },
				isNotEmpty: { type: GraphQLBoolean },
				none: { type: targetWhere },
				some: { type: targetWhere },
			}
		}
		const valueType =
			path.length === 1 && path[0] === 'id'
				? GraphQLID
				: this.#fieldTypes.inputElementType(field, schema, path)
		if (getFieldListDepth(field.options) > 0) {
			const listType = nonNullList(valueType)
			return {
				eq: { type: listType },
				ne: { type: listType },
				has: { type: valueType },
				hasEvery: { type: listType },
				hasSome: { type: listType },
				isEmpty: { type: GraphQLBoolean },
				...nullOperators(),
			}
		}
		const fields: GraphQLInputFieldConfigMap = {}
		if (
			equalityFieldKinds.has(field.kind) ||
			getPluginFieldStorageCodec(field) !== undefined
		) {
			Object.assign(fields, equalityOperators(valueType))
		}
		if (orderedFieldKinds.has(field.kind)) {
			const range = this.#range(name, valueType, schema, path)
			Object.assign(fields, {
				between: { type: range },
				gt: { type: valueType },
				gte: { type: valueType },
				lt: { type: valueType },
				lte: { type: valueType },
				notBetween: { type: range },
			})
		}
		if (field.kind === 'string') {
			Object.assign(fields, {
				contains: { type: GraphQLString },
				endsWith: { type: GraphQLString },
				matches: { type: this.#structural.regex() },
				startsWith: { type: GraphQLString },
			})
		}
		if (field.kind === 'json' || field.kind === 'object') {
			Object.assign(fields, {
				contains: { type: GraphqlJSON },
				hasAllKeys: { type: nonNullList(GraphQLString) },
				hasAnyKeys: { type: nonNullList(GraphQLString) },
				hasKey: { type: GraphQLString },
				at: { type: nonNullList(this.#structural.pathFilter(schema, path)) },
			})
			if (field.kind === 'object') {
				// Embedded objects compare against a typed partial instead of JSON.
				const partial = this.#structural.partialObject(schema, field, path)
				fields.contains = { type: partial }
			}
		} else if (
			!isGraphqlBuiltInFieldKind(field.kind) &&
			getPluginFieldStructuralContains(field) !== undefined
		) {
			fields.contains = { type: GraphqlJSON }
		}
		return Object.assign(fields, nullOperators())
	}

	where(schema: SchemaDefinition): GraphQLInputObjectType {
		return memoize(this.#whereTypes, schema, () => {
			const name = `${this.#ctx.typeName(schema)}Where`
			this.#ctx.claim(name, schema)
			const result: GraphQLInputObjectType = new GraphQLInputObjectType({
				name,
				fields: () => ({
					AND: { type: nonNullList(result) },
					OR: { type: nonNullList(result) },
					NOT: { type: result },
					...Object.fromEntries(
						Object.entries(schema.persistedFields).map(([fieldName, field]) => {
							assertSchemaFieldName(schema, [fieldName])
							return [
								fieldName,
								{ type: this.#fieldFilter(field, schema, [fieldName]) },
							]
						}),
					),
				}),
			})
			return this.#ctx.add('filters', result)
		})
	}

	order(schema: SchemaDefinition): GraphQLInputObjectType {
		return memoize(this.#orders, schema, () => {
			const typeName = this.#ctx.typeName(schema)
			const enumName = `${typeName}OrderField`
			this.#ctx.claim(enumName, schema)
			const field = this.#ctx.add(
				'filters',
				new GraphQLEnumType({
					name: enumName,
					values: Object.fromEntries(
						Object.keys(schema.persistedFields).map((name) => [
							name,
							{ value: name },
						]),
					),
				}),
			)
			const name = `${typeName}Order`
			this.#ctx.claim(name, schema)
			return this.#ctx.add(
				'filters',
				new GraphQLInputObjectType({
					name,
					fields: {
						direction: {
							type: new GraphQLNonNull(this.#structural.direction()),
						},
						field: { type: new GraphQLNonNull(field) },
					},
				}),
			)
		})
	}
}

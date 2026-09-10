import type {
	GenericOutputDescriptor,
	OutputFields,
	SchemaDefinition,
} from '@ultimabase/core'
import { isPlainRecord } from '@ultimabase/shared'
import {
	GraphQLBoolean,
	GraphQLEnumType,
	GraphQLFloat,
	GraphQLList,
	GraphQLNonNull,
	GraphQLObjectType,
	GraphQLString,
	type GraphQLFieldConfigMap,
	type GraphQLNamedType,
	type GraphQLNullableOutputType,
	type GraphQLOutputType,
} from 'graphql'

import { GraphqlSchemaCompilationError } from './errors.js'
import { readGraphqlFieldOwner } from './field-metadata.js'
import {
	assertGraphqlFieldName,
	graphqlEnumValueName,
	graphqlFieldTypeSegment,
} from './names.js'
import type { GraphqlNameRegistry } from './names.js'
import {
	GraphqlBase64,
	GraphqlBigInt,
	GraphqlDate,
	GraphqlDateTime,
	GraphqlDecimal,
	GraphqlJSON,
	GraphqlSafeInt,
	GraphqlTime,
	GraphqlUUID,
} from './scalars.js'
import { graphqlSourceDescription } from './surfaces.js'

interface NamedOutputType<TType extends GraphQLNamedType> {
	readonly signature: string
	readonly source: string
	readonly type: TType
}

const builtInOutputKinds: ReadonlySet<string> = new Set([
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
	'object',
	'string',
	'time',
	'uuid',
])

const readOutputFields = (
	descriptor: GenericOutputDescriptor,
	path: string,
): OutputFields => {
	const fields: unknown = Reflect.get(descriptor.options, 'fields')
	if (!isPlainRecord(fields)) {
		throw new TypeError(`${path} requires output object fields`)
	}
	return fields as OutputFields
}

const readTypeName = (
	descriptor: GenericOutputDescriptor,
): string | undefined => {
	const typeName: unknown = Reflect.get(descriptor.options, 'typeName')
	return typeof typeName === 'string' ? typeName : undefined
}

const readEnumValues = (
	descriptor: GenericOutputDescriptor,
): readonly string[] => {
	const values: unknown = Reflect.get(descriptor.options, 'values')
	if (Array.isArray(values)) {
		return values.filter((value): value is string => typeof value === 'string')
	}
	if (isPlainRecord(values)) {
		return Object.values(values).filter(
			(value): value is string => typeof value === 'string',
		)
	}
	return []
}

const outputShapeSignature = (descriptor: GenericOutputDescriptor): string => {
	const common = `${descriptor.kind}:${String(descriptor.options.list)}:${String(descriptor.options.nullable)}`
	if (descriptor.kind === 'enum') {
		return `${common}:${readTypeName(descriptor) ?? ''}:${JSON.stringify(readEnumValues(descriptor))}`
	}
	if (descriptor.kind !== 'object') return common
	const fields = Object.entries(
		readOutputFields(descriptor, descriptor.kind),
	).map(([name, child]) => [name, outputShapeSignature(child)])
	return `${common}:${readTypeName(descriptor) ?? ''}:${JSON.stringify(fields)}`
}

const scalarOutputType = (
	descriptor: GenericOutputDescriptor,
): GraphQLNullableOutputType | undefined => {
	switch (descriptor.kind) {
		case 'string':
			return GraphQLString
		case 'boolean':
			return GraphQLBoolean
		case 'int':
			return GraphqlSafeInt
		case 'float':
			return GraphQLFloat
		case 'bigint':
			return GraphqlBigInt
		case 'decimal':
			return GraphqlDecimal
		case 'date':
			return GraphqlDate
		case 'time':
			return GraphqlTime
		case 'dateTime':
			return GraphqlDateTime
		case 'binary':
			return GraphqlBase64
		case 'uuid':
			return GraphqlUUID
		case 'json':
			return GraphqlJSON
		default:
			return undefined
	}
}

/** Compiles Core output-only descriptors without installing GraphQL resolvers. */
export class GraphqlOutputTypeCompiler {
	readonly #names: GraphqlNameRegistry
	readonly #types: GraphQLNamedType[] = []
	readonly #namedEnums = new Map<string, NamedOutputType<GraphQLEnumType>>()
	readonly #namedObjects = new Map<string, NamedOutputType<GraphQLObjectType>>()

	constructor(names: GraphqlNameRegistry) {
		this.#names = names
	}

	get types(): readonly GraphQLNamedType[] {
		return this.#types
	}

	#failure(
		schema: SchemaDefinition,
		path: readonly string[],
		message: string,
	): never {
		const owner = readGraphqlFieldOwner(schema, path)
		throw new GraphqlSchemaCompilationError('name-collision', message, {
			owner,
			path: `${schema.className}.${path.join('.')}`,
		})
	}

	#assertSupported(
		descriptor: GenericOutputDescriptor,
		schema: SchemaDefinition,
		path: readonly string[],
	): void {
		if (!builtInOutputKinds.has(descriptor.kind)) {
			throw new GraphqlSchemaCompilationError(
				'missing-field-codec',
				`Virtual output ${schema.className}.${path.join('.')} uses ${descriptor.kind} without an exact GraphQL v1 representation`,
				{
					owner: readGraphqlFieldOwner(schema, path),
					path: `${schema.className}.${path.join('.')}`,
				},
			)
		}
		if (descriptor.kind !== 'object') return
		for (const [name, child] of Object.entries(
			readOutputFields(descriptor, `${schema.className}.${path.join('.')}`),
		)) {
			this.#assertSupported(child, schema, [...path, name])
		}
	}

	#claim(
		name: string,
		schema: SchemaDefinition,
		path: readonly string[],
	): void {
		this.#names.claimType(name, {
			description: graphqlSourceDescription(schema, path),
			owner: readGraphqlFieldOwner(schema, path),
		})
	}

	#namedType<TType extends GraphQLNamedType>(
		cache: Map<string, NamedOutputType<TType>>,
		name: string,
		signature: string,
		schema: SchemaDefinition,
		path: readonly string[],
		create: () => TType,
	): TType {
		const source = graphqlSourceDescription(schema, path)
		const existing = cache.get(name)
		if (existing !== undefined) {
			if (existing.signature !== signature) {
				return this.#failure(
					schema,
					path,
					`GraphQL output type "${name}" from ${source} conflicts with ${existing.source}`,
				)
			}
			return existing.type
		}
		this.#claim(name, schema, path)
		const type = create()
		cache.set(name, { signature, source, type })
		this.#types.push(type)
		return type
	}

	#enum(
		descriptor: GenericOutputDescriptor,
		schema: SchemaDefinition,
		path: readonly string[],
		modelTypeName: string,
	): GraphQLEnumType {
		const explicit = readTypeName(descriptor)
		const name =
			explicit ??
			`${modelTypeName}${path.map(graphqlFieldTypeSegment).join('')}`
		const signature = outputShapeSignature(descriptor)
		return this.#namedType(
			this.#namedEnums,
			name,
			signature,
			schema,
			path,
			() =>
				new GraphQLEnumType({
					name,
					values: Object.fromEntries(
						readEnumValues(descriptor).map((value) => [
							graphqlEnumValueName(value),
							{ value },
						]),
					),
				}),
		)
	}

	#object(
		descriptor: GenericOutputDescriptor,
		schema: SchemaDefinition,
		path: readonly string[],
		modelTypeName: string,
	): GraphQLObjectType {
		const explicit = readTypeName(descriptor)
		const name =
			explicit ??
			`${modelTypeName}${path.map(graphqlFieldTypeSegment).join('')}`
		const fields = readOutputFields(
			descriptor,
			`${schema.className}.${path.join('.')}`,
		)
		return this.#namedType(
			this.#namedObjects,
			name,
			outputShapeSignature(descriptor),
			schema,
			path,
			() =>
				new GraphQLObjectType({
					name,
					fields: () => this.#objectFields(fields, schema, path, modelTypeName),
				}),
		)
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
				assertGraphqlFieldName(
					name,
					graphqlSourceDescription(schema, path),
					readGraphqlFieldOwner(schema, path),
				)
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
		const element =
			scalarOutputType(descriptor) ??
			(descriptor.kind === 'enum'
				? this.#enum(descriptor, schema, path, modelTypeName)
				: this.#object(descriptor, schema, path, modelTypeName))
		const value: GraphQLNullableOutputType = descriptor.options.list
			? new GraphQLList(new GraphQLNonNull(element))
			: element
		return descriptor.options.nullable ? value : new GraphQLNonNull(value)
	}
}

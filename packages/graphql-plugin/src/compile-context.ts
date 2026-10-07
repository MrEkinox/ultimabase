import { createHash } from 'node:crypto'

import type {
	CompiledSchemaRegistry,
	GenericField,
	SchemaContributionOwner,
	SchemaDefinition,
	SchemaFields,
} from '@ultimabase/core'
import {
	GraphQLList,
	GraphQLNonNull,
	isInputObjectType,
	isObjectType,
	type GraphQLNamedType,
	type GraphQLNullableType,
} from 'graphql'

import { GraphqlSchemaCompilationError } from './errors.js'
import type { GraphqlSchemaSurface } from './surfaces.js'

const typeNamePattern = /^[A-Z][_0-9A-Za-z]*$/u
const namePattern = /^[_A-Za-z][_0-9A-Za-z]*$/u

/** Accepts field and enum value names that GraphQL can represent without aliases. */
export const isGraphqlName = (name: string): boolean =>
	namePattern.test(name) && !name.startsWith('__')

const failure = (
	reason: 'invalid-name' | 'name-collision',
	message: string,
	path: string,
	owner: SchemaContributionOwner | undefined,
): GraphqlSchemaCompilationError =>
	new GraphqlSchemaCompilationError(reason, message, {
		...(owner === undefined ? {} : { owner }),
		path,
	})

/** Validates and owns every generated type identity before GraphQL sees it. */
export class GraphqlNameRegistry {
	readonly #types = new Map<string, string>()

	claimType(
		name: string,
		description: string,
		owner?: SchemaContributionOwner,
	): void {
		if (!typeNamePattern.test(name) || name.startsWith('__')) {
			throw failure(
				'invalid-name',
				`Invalid GraphQL type name "${name}" from ${description}`,
				name,
				owner,
			)
		}
		const existing = this.#types.get(name)
		if (existing !== undefined) {
			throw failure(
				'name-collision',
				`GraphQL type "${name}" from ${description} conflicts with ${existing}`,
				name,
				owner,
			)
		}
		this.#types.set(name, description)
	}
}

/** Rejects schema fields that cannot be represented without an alias. */
export const assertGraphqlFieldName = (
	name: string,
	description: string,
	owner?: SchemaContributionOwner,
): void => {
	if (!isGraphqlName(name)) {
		throw failure(
			'invalid-name',
			`Invalid GraphQL field name "${name}" from ${description}`,
			name,
			owner,
		)
	}
}

/** Describes a schema or one of its field paths in compilation diagnostics. */
export const graphqlSourceDescription = (
	schema: SchemaDefinition,
	path?: readonly string[],
): string =>
	path === undefined
		? `schema ${schema.className}`
		: `field ${schema.className}.${path.join('.')}`

/** Resolves the contributor of a top-level field, falling back to the schema owner. */
export const graphqlFieldOwner = (
	schema: SchemaDefinition,
	path: readonly string[],
): SchemaContributionOwner =>
	schema.definition.provenance.fields[path[0] ?? '']?.owner ??
	schema.definition.provenance.schema.owner

/** Validates the last segment of one schema field path as a GraphQL field name. */
export const assertSchemaFieldName = (
	schema: SchemaDefinition,
	path: readonly string[],
): void => {
	assertGraphqlFieldName(
		path.at(-1) ?? '',
		graphqlSourceDescription(schema, path),
		graphqlFieldOwner(schema, path),
	)
}

/** Produces the stable child-name segment shared with Typegen conventions. */
export const graphqlFieldTypeSegment = (name: string): string =>
	`${name[0]?.toUpperCase() ?? ''}${name.slice(1)}`

/** Maps every Core enum value to one reversible GraphQL enum identity. */
export const graphqlEnumValueName = (value: string): string =>
	isGraphqlName(value)
		? value
		: `VALUE_${createHash('sha256').update(value, 'utf8').digest('hex').toUpperCase()}`

/** Reads the optional string description of one field or virtual field. */
export const readGraphqlDescription = (field: {
	readonly options: object
}): string | undefined => {
	const description: unknown = Reflect.get(field.options, 'description')
	return typeof description === 'string' ? description : undefined
}

/** Reads the declared string values of a Core enum field or output descriptor. */
export const readGraphqlEnumValues = (options: object): readonly string[] => {
	const values: unknown = Reflect.get(options, 'values')
	const declared: readonly unknown[] = Array.isArray(values)
		? values
		: typeof values === 'object' && values !== null
			? Object.values(values)
			: []
	return declared.filter((value): value is string => typeof value === 'string')
}

/** Reads the child fields retained by one compiled embedded-object field. */
export const readGraphqlObjectFields = (field: GenericField): SchemaFields => {
	const fields = 'fields' in field.options ? field.options.fields : undefined
	if (typeof fields !== 'object' || fields === null || Array.isArray(fields)) {
		throw new TypeError('Compiled object field must retain child fields')
	}
	// Core validates embedded object children before the schema is compiled.
	return fields as SchemaFields
}

/** Wraps one type in GraphQL's non-null element list. */
export const nonNullList = <TType extends GraphQLNullableType>(
	type: TType,
): GraphQLList<GraphQLNonNull<TType>> =>
	new GraphQLList(new GraphQLNonNull(type))

/** Returns the cached value for a key, creating and caching it once. */
export const memoize = <TKey, TValue>(
	cache: Map<TKey, TValue>,
	key: TKey,
	create: () => TValue,
): TValue => {
	const existing = cache.get(key)
	if (existing !== undefined) return existing
	const value = create()
	cache.set(key, value)
	return value
}

/** Keys one schema field path for per-path type caches. */
export const fieldPathKey = (
	schema: SchemaDefinition,
	path: readonly string[],
): string => `${schema.className}\0${path.join('\0')}`

// Generated named types are emitted in this list order, which fixes the order of
// the schema type map and therefore of unsorted SDL and introspection output.
const typeLists = [
	'models',
	'connections',
	'outputs',
	'mutationInputs',
	'rootInputs',
	'bindings',
	'filters',
	'filterShared',
	'structural',
] as const

/** Names one ordered list of generated GraphQL types. */
export type GraphqlTypeList = (typeof typeLists)[number]

/** Shares names, schema lookups and ordered type lists between compilers. */
export class GraphqlCompileContext {
	readonly names: GraphqlNameRegistry
	readonly schemas: CompiledSchemaRegistry
	readonly surfaces: ReadonlyMap<SchemaDefinition, GraphqlSchemaSurface>
	readonly #lists: Readonly<Record<GraphqlTypeList, GraphQLNamedType[]>> = {
		models: [],
		connections: [],
		outputs: [],
		mutationInputs: [],
		rootInputs: [],
		bindings: [],
		filters: [],
		filterShared: [],
		structural: [],
	}

	constructor(
		names: GraphqlNameRegistry,
		schemas: CompiledSchemaRegistry,
		surfaces: ReadonlyMap<SchemaDefinition, GraphqlSchemaSurface>,
	) {
		this.names = names
		this.schemas = schemas
		this.surfaces = surfaces
	}

	/** Every generated named type in deterministic schema order. */
	get types(): readonly GraphQLNamedType[] {
		return typeLists.flatMap((list) => this.#lists[list])
	}

	surface(schema: SchemaDefinition): GraphqlSchemaSurface {
		const surface = this.surfaces.get(schema)
		if (surface === undefined) {
			throw new TypeError('GraphQL schema surface is unavailable')
		}
		return surface
	}

	target(schema: SchemaDefinition, path: readonly string[]): SchemaDefinition {
		const target = this.schemas.schemaTargets.get(schema, path)
		if (target === undefined) {
			throw new TypeError(
				`Missing compiled target for ${schema.className}.${path.join('.')}`,
			)
		}
		return target
	}

	/** Names a generated type after the schema GraphQL name and a field path. */
	typeName(schema: SchemaDefinition, path: readonly string[] = []): string {
		return `${this.surface(schema).typeName}${path.map(graphqlFieldTypeSegment).join('')}`
	}

	/** Claims a type name on behalf of the schema owner. */
	claim(
		name: string,
		schema: SchemaDefinition,
		path?: readonly string[],
	): void {
		this.names.claimType(
			name,
			graphqlSourceDescription(schema, path),
			schema.definition.provenance.schema.owner,
		)
	}

	/** Appends one created type to an ordered list and returns it. */
	add<TType extends GraphQLNamedType>(
		list: GraphqlTypeList,
		type: TType,
	): TType {
		this.#lists[list].push(type)
		return type
	}

	/** Forces field thunks list by list, including types appended meanwhile. */
	materialize(lists: readonly GraphqlTypeList[]): void {
		for (const list of lists) {
			for (const type of this.#lists[list]) {
				if (isObjectType(type) || isInputObjectType(type)) type.getFields()
			}
		}
	}
}

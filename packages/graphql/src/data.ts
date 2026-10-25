// A schema's GraphQL types, from its standard JSON Schema export (D-45,
// D-109): what a function takes and returns as data. A schema given an id
// is one shared type; any other object or enum is named from its path.
import type {
	GraphQLFieldConfigArgumentMap,
	GraphQLInputType,
	GraphQLNullableInputType,
	GraphQLNullableOutputType,
	GraphQLNullableType,
	GraphQLScalarType,
} from 'graphql'
import {
	GraphQLBoolean,
	GraphQLEnumType,
	GraphQLFloat,
	GraphQLInputObjectType,
	GraphQLInt,
	GraphQLList,
	GraphQLNonNull,
	GraphQLObjectType,
	GraphQLString,
} from 'graphql'
import type { Node, Side } from './json-schema.ts'
import { defsOf, isNode, jsonSchemaOf } from './json-schema.ts'
import { upper } from './names.ts'
import type { Context } from './registry.ts'
import { DateTime, JSONScalar } from './scalars.ts'
import { Refused } from 'ultimabase'

const reserved = new Set(['true', 'false', 'null'])
const named = (value: string): boolean =>
	/^[_A-Za-z][_0-9A-Za-z]*$/.test(value) && !value.startsWith('__')
const isName = (value: unknown): value is string =>
	typeof value === 'string' && named(value)
const isValue = (value: unknown): value is string =>
	isName(value) && !reserved.has(value)

/** Where a node is: who a message names, a type's name, and the path. */
export type Path = {
	readonly owner: string
	readonly name: string
	/** `Input` under a shared input type: `AddressInput`, `AddressGeoInput`. */
	readonly suffix: string
	readonly at: string
}

/** Stops startup on a name GraphQL refuses. */
export function checkName(name: string, where: string): string {
	if (named(name)) return name
	throw new Refused(`${where}: ${name} is not a GraphQL name.`)
}

type Shaped<T> = {
	readonly key: string
	readonly owner: string
	readonly type: T
}

/** The functions' named types, each name given one shape (D-45). */
export class DataTypes {
	readonly #objects = new Map<string, Shaped<GraphQLObjectType>>()
	readonly #inputs = new Map<string, Shaped<GraphQLInputObjectType>>()
	readonly #enums = new Map<string, Shaped<GraphQLEnumType>>()
	readonly #models: ReadonlySet<string>
	/** Each named type the functions give, and the first to give it. */
	readonly owners: Map<string, string> = new Map()

	constructor(models: Iterable<string>) {
		this.#models = new Set(models)
	}

	object(
		name: string,
		key: string,
		owner: string,
		build: () => GraphQLObjectType,
	): GraphQLObjectType {
		return this.#shaped(this.#objects, name, key, owner, build)
	}

	input(
		name: string,
		key: string,
		owner: string,
		build: () => GraphQLInputObjectType,
	): GraphQLInputObjectType {
		return this.#shaped(this.#inputs, name, key, owner, build)
	}

	enum(
		name: string,
		values: readonly string[],
		owner: string,
	): GraphQLEnumType {
		const build = () =>
			new GraphQLEnumType({
				name,
				values: Object.fromEntries(values.map((value) => [value, { value }])),
			})
		return this.#shaped(this.#enums, name, values.join(), owner, build)
	}

	#shaped<T>(
		cache: Map<string, Shaped<T>>,
		name: string,
		key: string,
		owner: string,
		build: () => T,
	): T {
		if (this.#models.has(name)) {
			throw new Refused(`${owner}: the type ${name} is named like a model.`)
		}
		const known = cache.get(name)
		if (known === undefined) {
			const type = build()
			cache.set(name, { key, owner, type })
			this.owners.set(name, owner)
			return type
		}
		if (known.key === key) return known.type
		throw new Refused(
			`${known.owner} and ${owner} give the type ${name} two shapes; name each once.`,
		)
	}
}

type Leaf = GraphQLScalarType | GraphQLEnumType
type Typed<T> = { readonly type: T; readonly nullable: boolean }

/** How one side builds its types, and the JSON Schema's shared ones. */
interface Scope<T extends GraphQLNullableType> {
	readonly side: Side
	readonly defs: Node
	readonly types: DataTypes
	readonly leaf: (type: Leaf) => T
	readonly list: (of: Typed<T>) => T
	readonly object: (node: Node, properties: Node, path: Path) => T
}

const union = (path: Path): Error =>
	new Refused(
		`${path.owner}: ${path.at} is a union, which GraphQL cannot type; keep one type, or one and null.`,
	)

function refType<T extends GraphQLNullableType>(
	ref: string,
	path: Path,
	scope: Scope<T>,
): Typed<T> {
	if (ref === '#') {
		throw new Refused(
			`${path.owner}: ${path.at} refers to its own schema; name it with .meta({ id }).`,
		)
	}
	const id = ref.startsWith('#/$defs/') ? ref.slice(8) : ''
	const node = scope.defs[id]
	if (!isNode(node)) {
		throw new Refused(
			`${path.owner}: ${path.at} refers to ${ref}, not a $defs.`,
		)
	}
	if (!named(id)) {
		throw new Refused(
			`${path.owner}: ${path.at} refers to ${id}, which is not a GraphQL name; name it with .meta({ id }).`,
		)
	}
	const suffix = scope.side === 'input' ? 'Input' : ''
	return dataType(node, { ...path, name: id, suffix }, scope)
}

function enumType(values: readonly unknown[], path: Path, types: DataTypes) {
	const names = values.filter((value) => value !== null)
	if (!names.every(isValue)) return GraphQLString
	return types.enum(path.name, names, path.owner)
}

function typeOf<T extends GraphQLNullableType>(
	type: unknown,
	node: Node,
	path: Path,
	scope: Scope<T>,
): T {
	const { const: only, enum: listed } = node
	const values: readonly unknown[] =
		only === undefined ? (Array.isArray(listed) ? listed : []) : [only]
	if (type === 'boolean') return scope.leaf(GraphQLBoolean)
	// A literal number is an `Int` when each of its values is whole.
	if (type === 'integer' || type === 'number') {
		const whole = values.length > 0 && values.every(Number.isInteger)
		return scope.leaf(type === 'integer' || whole ? GraphQLInt : GraphQLFloat)
	}
	if (only !== undefined) return scope.leaf(GraphQLString)
	if (values.length > 0) return scope.leaf(enumType(values, path, scope.types))
	if (type === 'string') {
		return scope.leaf(node['format'] === 'date-time' ? DateTime : GraphQLString)
	}
	if (type === 'array') {
		const items = isNode(node['items']) ? node['items'] : {}
		return scope.list(dataType(items, { ...path, at: `${path.at}[]` }, scope))
	}
	const { properties } = node
	if (type === 'object' && isNode(properties)) {
		if (Object.keys(properties).length > 0) {
			return scope.object(node, properties, path)
		}
	}
	return scope.leaf(JSONScalar)
}

/** A node's GraphQL type, and whether it accepts `null`. */
function dataType<T extends GraphQLNullableType>(
	node: Node,
	path: Path,
	scope: Scope<T>,
): Typed<T> {
	const ref = node['$ref']
	if (typeof ref === 'string') return refType(ref, path, scope)
	const variants: unknown = node['anyOf'] ?? node['oneOf']
	if (Array.isArray(variants)) {
		const others: readonly unknown[] = variants.filter(
			(variant) => !isNode(variant) || variant['type'] !== 'null',
		)
		const [only] = others
		if (others.length !== 1 || variants.length !== 2 || !isNode(only)) {
			throw union(path)
		}
		return { type: dataType(only, path, scope).type, nullable: true }
	}
	const listed: readonly unknown[] = Array.isArray(node['type'])
		? node['type']
		: [node['type']]
	const types = listed.filter((type) => type !== undefined && type !== 'null')
	if (types.length > 1) throw union(path)
	return {
		type: typeOf(types[0], node, path, scope),
		nullable: types.length < listed.length,
	}
}

/** Each property's type, and whether it always holds a value. */
function propertiesOf<T extends GraphQLNullableType>(
	node: Node,
	properties: Node,
	path: Path,
	scope: Scope<T>,
): (readonly [string, T | GraphQLNonNull<T>])[] {
	const listed: readonly unknown[] = Array.isArray(node['required'])
		? node['required']
		: []
	return Object.entries(properties).map(([key, value]) => {
		const at = `${path.at}.${key}`
		checkName(key, `${path.owner}: ${at}`)
		const child = { ...path, name: `${path.name}${upper(key)}`, at }
		const property = isNode(value) ? value : {}
		const { type, nullable } = dataType(property, child, scope)
		// A default fills an input the client leaves out.
		const defaulted =
			scope.side === 'input' && property['default'] !== undefined
		const required = listed.includes(key) && !nullable && !defaulted
		return [key, required ? new GraphQLNonNull(type) : type]
	})
}

/** An object type's fields, read when the schema is built. */
const fieldsOf =
	<T extends GraphQLNullableType>(
		node: Node,
		properties: Node,
		path: Path,
		scope: Scope<T>,
	) =>
	(): { [key: string]: { type: T | GraphQLNonNull<T> } } =>
		Object.fromEntries(
			propertiesOf(node, properties, path, scope).map(([key, type]) => [
				key,
				{ type },
			]),
		)

const listOf = <T extends GraphQLNullableType>({ type, nullable }: Typed<T>) =>
	new GraphQLList(nullable ? type : new GraphQLNonNull(type))

function outputScope(
	root: Node,
	types: DataTypes,
): Scope<GraphQLNullableOutputType> {
	const scope: Scope<GraphQLNullableOutputType> = {
		side: 'output',
		defs: defsOf(root),
		types,
		leaf: (type) => type,
		list: listOf,
		object: (node, properties, path) =>
			types.object(
				path.name,
				JSON.stringify(node),
				path.owner,
				() =>
					new GraphQLObjectType<unknown, Context>({
						name: path.name,
						fields: fieldsOf(node, properties, path, scope),
					}),
			),
	}
	return scope
}

function inputScope(
	root: Node,
	types: DataTypes,
): Scope<GraphQLNullableInputType> {
	const scope: Scope<GraphQLNullableInputType> = {
		side: 'input',
		defs: defsOf(root),
		types,
		leaf: (type) => type,
		list: listOf,
		object: (node, properties, path) => {
			const name = `${path.name}${path.suffix}`
			return types.input(
				name,
				JSON.stringify(node),
				path.owner,
				() =>
					new GraphQLInputObjectType({
						name,
						fields: fieldsOf(node, properties, path, scope),
					}),
			)
		},
	}
	return scope
}

/** An output schema's type, nullable when its JSON Schema accepts `null`. */
export function outputData(
	schema: object,
	path: Path,
	types: DataTypes,
): Typed<GraphQLNullableOutputType> {
	const root = jsonSchemaOf(schema, 'output', `${path.owner}: ${path.at}`)
	return dataType(root, path, outputScope(root, types))
}

/**
 * An object input's properties as arguments, `flat`; any other input as one
 * `input` argument (D-109).
 */
export function inputArgs(
	schema: object,
	path: Path,
	types: DataTypes,
): { readonly args: GraphQLFieldConfigArgumentMap; readonly flat: boolean } {
	const root = jsonSchemaOf(schema, 'input', `${path.owner}: ${path.at}`)
	const scope = inputScope(root, types)
	const ref = root['$ref']
	const object = typeof ref === 'string' ? scope.defs[ref.slice(8)] : root
	const properties = isNode(object) ? object['properties'] : undefined
	if (isNode(object) && object['type'] === 'object' && isNode(properties)) {
		const args = propertiesOf(object, properties, path, scope).map(
			([key, type]): [string, { type: GraphQLInputType }] => [key, { type }],
		)
		return { args: Object.fromEntries(args), flat: true }
	}
	const { type, nullable } = dataType(root, path, scope)
	return {
		args: { input: { type: nullable ? type : new GraphQLNonNull(type) } },
		flat: false,
	}
}

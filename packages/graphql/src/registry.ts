// What the schema is built from (D-107): each model with its names and
// limits, the plugin's settings, and each type built once, when first used.
import type {
	GraphQLInputObjectType,
	GraphQLObjectType,
	GraphQLResolveInfo,
	GraphQLScalarType,
} from 'graphql'
import {
	GraphQLBoolean,
	GraphQLEnumType,
	GraphQLFloat,
	GraphQLString,
} from 'graphql'
import type {
	Caller,
	Client,
	ExposedModel,
	SchemaField,
	SchemaModel,
} from 'ultimabase'
import { upper } from './names.ts'
import { DateTime, JSONScalar } from './scalars.ts'

/** A model's key of `.with` (D-107). */
export type GraphqlWith =
	{ readonly plural?: string; readonly maxTake?: number } | false

/** What every resolver receives, the generated ones and those `extend` adds. */
export type Context = {
	readonly caller: Caller
	/** The request's client, which a function's `run` receives (D-113). */
	readonly client: Client
	/**
	 * The kernel's `select` for what the client asks of the rows a field
	 * returns, relations and their pages included; spread it to add a field.
	 * Its type names `id` only: the rest depends on the document.
	 */
	readonly select: (info: GraphQLResolveInfo) => { readonly id: true }
}
/** A kernel query's options: run as the request's caller (D-106). */
export const as = (context: Context): { readonly as: Caller } => ({
	as: context.caller,
})
export type Args = { readonly [arg: string]: unknown }
export type Scalar = Extract<SchemaField, { readonly kind: 'scalar' }>

export type Entry = {
	readonly exposed: ExposedModel<GraphqlWith>
	readonly model: SchemaModel
	/** In the root fields; a hidden model is reached by relations only. */
	readonly visible: boolean
	readonly single: string
	readonly list: string
	/** The rows a list returns without `first`, `last` or `take`. */
	readonly take: number
	readonly maxTake: number
}

export type Settings = {
	readonly pagination: 'connection' | 'list'
}

function memo<T>(cache: Map<string, T>, name: string, build: () => T): T {
	const found = cache.get(name)
	if (found !== undefined) return found
	const built = build()
	cache.set(name, built)
	return built
}

export class Registry {
	readonly #objects = new Map<string, GraphQLObjectType>()
	readonly #inputs = new Map<string, GraphQLInputObjectType>()
	readonly #enums = new Map<string, GraphQLEnumType>()
	readonly entries: ReadonlyMap<string, Entry>
	readonly settings: Settings

	constructor(entries: ReadonlyMap<string, Entry>, settings: Settings) {
		this.entries = entries
		this.settings = settings
	}

	entry(model: string): Entry {
		const entry = this.entries.get(model)
		if (entry === undefined) throw new Error(`Unknown model ${model}.`)
		return entry
	}

	object(name: string, build: () => GraphQLObjectType): GraphQLObjectType {
		return memo(this.#objects, name, build)
	}

	input(
		name: string,
		build: () => GraphQLInputObjectType,
	): GraphQLInputObjectType {
		return memo(this.#inputs, name, build)
	}

	enum(name: string, build: () => GraphQLEnumType): GraphQLEnumType {
		return memo(this.#enums, name, build)
	}
}

export const scalarTypes: {
	readonly [T in Exclude<Scalar['type'], 'enum'>]: GraphQLScalarType
} = {
	string: GraphQLString,
	number: GraphQLFloat,
	boolean: GraphQLBoolean,
	date: DateTime,
	json: JSONScalar,
}

/** The fields a caller other than Master may read: no `private` one (D-44). */
export const readable = (entry: Entry): readonly SchemaField[] =>
	entry.model.fields.filter(
		(field) => entry.exposed.readRules[field.name] !== 'private',
	)

/** A scalar field's type; an enum's is `PostStatus`, built once. */
export function scalarType(
	registry: Registry,
	model: string,
	field: Scalar,
): GraphQLScalarType | GraphQLEnumType {
	if (field.type !== 'enum') return scalarTypes[field.type]
	const name = `${model}${upper(field.name)}`
	return registry.enum(
		name,
		() =>
			new GraphQLEnumType({
				name,
				values: Object.fromEntries(
					(field.values ?? []).map((value) => [value, { value }]),
				),
			}),
	)
}

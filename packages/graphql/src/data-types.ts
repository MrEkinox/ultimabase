// The data types functions and json fields give (D-45, D-125), each name
// given one shape, none named like a model.
import type {
	GraphQLInputObjectType,
	GraphQLNamedType,
	GraphQLObjectType,
} from 'graphql'
import { GraphQLEnumType } from 'graphql'
import { Refused } from 'ultimabase'

type Shaped<T> = {
	readonly key: string
	readonly owner: string
	readonly type: T
}

/** The named types of functions and json fields, each given one shape. */
export class DataTypes {
	readonly #objects = new Map<string, Shaped<GraphQLObjectType>>()
	readonly #inputs = new Map<string, Shaped<GraphQLInputObjectType>>()
	readonly #enums = new Map<string, Shaped<GraphQLEnumType>>()
	readonly #models: ReadonlySet<string>
	/** Each named type, and the first function or field to give it. */
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
		description?: string,
	): GraphQLEnumType {
		const build = () =>
			new GraphQLEnumType({
				name,
				description,
				values: Object.fromEntries(values.map((value) => [value, { value }])),
			})
		return this.#shaped(this.#enums, name, values.join(), owner, build)
	}

	/** The type named `name`, if one was given. */
	named(name: string): GraphQLNamedType | undefined {
		return (
			this.#objects.get(name)?.type ??
			this.#inputs.get(name)?.type ??
			this.#enums.get(name)?.type
		)
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

// The application's functions (D-109): a query under Query, a mutation
// under Mutation, each run as the request's caller with the arguments the
// client sent.
import type { GraphQLFieldConfig, GraphQLOutputType } from 'graphql'
import {
	GraphQLBoolean,
	GraphQLList,
	GraphQLNonNull,
	GraphQLObjectType,
} from 'graphql'
import type { ExposedFunction, ExposedOutput, ExposedType } from 'ultimabase'
import { Refused } from 'ultimabase'
import type { Path } from './data.ts'
import type { DataTypes } from './data-types.ts'
import { checkName, inputArgs, outputData } from './data.ts'
import { upper } from './names.ts'
import { objectType } from './outputs.ts'
import type { Args, Context, Registry } from './registry.ts'
import { as } from './registry.ts'
import { reread } from './reread.ts'
import { plain } from './scalars.ts'
import type { Read } from './rows.ts'

/** A function's key of `.with` (D-109): its field's name, or hidden. */
export type GraphqlFunctionWith = { readonly name?: string } | false

export type Field = GraphQLFieldConfig<unknown, Context, Args>

/** A function's root field, and the function that gives it. */
export type RootField = {
	readonly query: boolean
	readonly name: string
	readonly owner: string
	readonly field: Field
}

const at = (owner: string, name: string, place: string): Path => ({
	owner,
	name,
	suffix: '',
	at: place,
})

class Builder {
	readonly #types = new Map<string, GraphQLObjectType>()
	readonly #registry: Registry
	readonly #data: DataTypes
	readonly #take: number
	/** What each field reads, by type then field, for the row budget. */
	readonly reads = new Map<string, Map<string, Read>>()
	/** Each named type, and the first function to give it. */
	readonly owners: Map<string, string>

	constructor(registry: Registry, take: number) {
		this.#registry = registry
		this.#data = registry.data
		this.owners = this.#data.owners
		this.#take = take
	}

	/** A model or a type is non-null unless `.nullable()`; a list too. */
	output(
		output: ExposedOutput,
		path: Path,
		parent: string,
		field: string,
	): GraphQLOutputType {
		if (output.kind === 'schema') {
			const { type, nullable } = outputData(output.schema, path, this.#data)
			return nullable ? type : new GraphQLNonNull(type)
		}
		const reads = this.reads.get(parent) ?? new Map<string, Read>()
		this.reads.set(parent, reads)
		const list = output.form === 'list'
		reads.set(
			field,
			list ? { kind: 'list', size: this.#take } : { kind: 'one' },
		)
		const named =
			output.kind === 'model'
				? objectType(this.#registry, output.name)
				: this.#type(output.type, path.owner)
		if (output.form === 'nullable') return named
		const item = new GraphQLNonNull(named)
		return list ? new GraphQLNonNull(new GraphQLList(item)) : item
	}

	/** A `defineType`, built once; its fields cannot refer back to it. */
	#type(type: ExposedType, owner: string): GraphQLObjectType {
		const known = this.#types.get(type.name)
		if (known !== undefined) return known
		const { name } = type
		checkName(name, `defineType ${name}`)
		const other = this.owners.get(name)
		if (other !== undefined) {
			throw new Refused(
				`${other} and ${owner} give the type ${name} two shapes; name each once.`,
			)
		}
		this.owners.set(name, owner)
		const fields = [...type.fields].map(([field, output]): [string, Field] => {
			checkName(field, `${name}.${field}`)
			const path = at(name, `${name}${upper(field)}`, field)
			return [field, { type: this.output(output, path, name, field) }]
		})
		const built = new GraphQLObjectType<unknown, Context>({
			name,
			description: type.description,
			fields: Object.fromEntries(fields),
		})
		this.#types.set(name, built)
		return built
	}

	field(fn: ExposedFunction, name: string, owner: string): Field {
		const { input, output } = fn
		const base = upper(name)
		const given =
			input === undefined
				? undefined
				: inputArgs(input, at(owner, `${base}Input`, 'input'), this.#data)
		const root = fn.query ? 'Query' : 'Mutation'
		const type =
			output === undefined
				? new GraphQLNonNull(GraphQLBoolean)
				: this.output(output, at(owner, `${base}Output`, 'output'), root, name)
		const registry = this.#registry
		const take = this.#take
		return {
			type,
			description: fn.description,
			args: given?.args ?? {},
			resolve: async (_, args, context, info) => {
				const sent = given?.flat === true ? args : args['input']
				const value = await fn.run(plain(sent), as(context), context.client)
				if (output === undefined) return true
				if (value === undefined && type instanceof GraphQLNonNull) {
					throw new TypeError(
						`${fn.name} returned undefined; make its output .nullable() and return null.`,
					)
				}
				const call = { name: fn.name, take }
				return reread(registry, output, value, context, info, call)
			},
		}
	}
}

/** The functions' root fields, and what each reads (D-109). */
export function functionFields(
	registry: Registry,
	functions: readonly ExposedFunction<GraphqlFunctionWith>[],
	take: number,
): {
	readonly fields: readonly RootField[]
	readonly reads: ReadonlyMap<string, ReadonlyMap<string, Read>>
	readonly owners: ReadonlyMap<string, string>
} {
	const builder = new Builder(registry, take)
	const fields: RootField[] = []
	for (const fn of functions) {
		if (fn.with === false) continue
		const name = checkName(fn.with?.name ?? fn.name, fn.name)
		// A plugin's function is named with its plugin (D-113).
		const owner = fn.plugin === undefined ? fn.name : `${fn.plugin}.${fn.name}`
		const field = builder.field(fn, name, owner)
		fields.push({ query: fn.query, name, owner, field })
	}
	return { fields, reads: builder.reads, owners: builder.owners }
}

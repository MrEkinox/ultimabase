// The application's functions (D-109): a query under Query, a mutation
// under Mutation, each run as the request's caller with the arguments the
// client sent; a live query also under Subscription (D-154).
import type {
	GraphQLFieldConfig,
	GraphQLNamedType,
	GraphQLOutputType,
	GraphQLResolveInfo,
} from 'graphql'
import {
	GraphQLBoolean,
	GraphQLList,
	GraphQLNonNull,
	GraphQLObjectType,
} from 'graphql'
import { readableVirtuals } from '@ultimabase/http/internal'
import type {
	ExposedFunction,
	ExposedOutput,
	ExposedType,
	ExposedVirtual,
} from 'ultimabase'
import { Refused } from 'ultimabase'
import type { Path } from './data.ts'
import type { DataTypes } from './data-types.ts'
import { checkName, inputArgs, outputData } from './data.ts'
import { upper } from './names.ts'
import { isMaster, objectType } from './outputs.ts'
import { selectOf } from './select.ts'
import { followed } from './subscriptions.ts'
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

/** Whether a model's rows, as `info` selects them, read a relation. */
function relates(
	registry: Registry,
	model: string,
	info: GraphQLResolveInfo,
	master: boolean,
): boolean {
	const type = objectType(registry, model)
	const select = selectOf(registry, info, type, info.fieldNodes, master)
	return Object.values(select).some((read) => read !== true)
}

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

	/** The type named `name`, if a function, a virtual or a field gave it. */
	named(name: string): GraphQLNamedType | undefined {
		return this.#types.get(name) ?? this.#data.named(name)
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

	/** A virtual's field: an argument per input property, its output (D-151). */
	virtual(model: string, virtual: ExposedVirtual, ruled: boolean): Field {
		const { name, input, output } = virtual
		const owner = `${model}.${name}`
		const base = `${model}${upper(name)}`
		const given =
			input === undefined
				? undefined
				: inputArgs(input, at(owner, `${base}Input`, 'input'), this.#data)
		if (given?.flat === false) {
			throw new Refused(
				`${owner}: its input is an object schema, whose properties are its arguments.`,
			)
		}
		const type = this.output(
			output,
			at(owner, `${base}Output`, name),
			model,
			name,
		)
		const take = this.#take
		const registry = this.#registry
		return {
			// Absent when a read rule hides it (D-44).
			type: ruled && type instanceof GraphQLNonNull ? type.ofType : type,
			description: virtual.description,
			args: given?.args ?? {},
			resolve: (source, _, context, info) => {
				const value: unknown = Reflect.get(Object(source), name)
				// The budget counts `take` rows in a list (D-109).
				if (
					output.kind === 'model' &&
					Array.isArray(value) &&
					value.length > take &&
					relates(registry, output.name, info, isMaster(context))
				) {
					throw new RangeError(
						`${owner} returned ${value.length} rows; a list counts take (${take}) rows, so it holds no more under a selected relation.`,
					)
				}
				return value
			},
		}
	}

	/**
	 * A function's field, and its subscription when it is `live` (D-154),
	 * whose rows the budget counts as the query's.
	 */
	field(
		fn: ExposedFunction,
		name: string,
		owner: string,
		live: boolean,
	): { readonly field: Field; readonly live?: Field } {
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
		const value = async (
			args: Args,
			context: Context,
			info: GraphQLResolveInfo,
		): Promise<unknown> => {
			const sent = given?.flat === true ? args : args['input']
			const result = await fn.run(plain(sent), as(context), context.client)
			if (output === undefined) return true
			if (result === undefined && type instanceof GraphQLNonNull) {
				throw new TypeError(
					`${fn.name} returned undefined; make its output .nullable() and return null.`,
				)
			}
			const call = { name: fn.name, take }
			return reread(registry, output, result, context, info, call)
		}
		const config = {
			type,
			description: fn.description,
			args: given?.args ?? {},
		}
		const field: Field = {
			...config,
			resolve: async (_, args, context, info) => value(args, context, info),
		}
		if (!live) return { field }
		const read = this.reads.get(root)?.get(name)
		if (read !== undefined) {
			const reads = this.reads.get('Subscription') ?? new Map<string, Read>()
			this.reads.set('Subscription', reads.set(name, read))
		}
		return { field, live: followed(owner, config, value) }
	}
}

/** The functions' root fields, and what each reads (D-109). */
export function functionFields(
	registry: Registry,
	functions: readonly ExposedFunction<GraphqlFunctionWith>[],
	take: number,
	live: (owner: string) => boolean,
): {
	readonly fields: readonly RootField[]
	/** The live functions' subscriptions, named as their fields (D-154). */
	readonly subscriptions: { readonly [name: string]: Field }
	readonly reads: ReadonlyMap<string, ReadonlyMap<string, Read>>
	readonly owners: ReadonlyMap<string, string>
	readonly named: (name: string) => GraphQLNamedType | undefined
} {
	const builder = new Builder(registry, take)
	registry.virtualFields = (model) => {
		const entry = registry.entry(model)
		const { readRules } = entry.exposed
		return Object.fromEntries(
			readableVirtuals(entry).map((virtual) => [
				virtual.name,
				builder.virtual(model, virtual, readRules[virtual.name] === 'rule'),
			]),
		)
	}
	const fields: RootField[] = []
	const subscriptions: { [name: string]: Field } = {}
	for (const fn of functions) {
		if (fn.with === false) continue
		const name = checkName(fn.with?.name ?? fn.name, fn.name)
		// A plugin's function is named with its plugin (D-113).
		const owner = fn.plugin === undefined ? fn.name : `${fn.plugin}.${fn.name}`
		const built = builder.field(fn, name, owner, live(owner))
		fields.push({ query: fn.query, name, owner, field: built.field })
		if (built.live !== undefined) subscriptions[name] = built.live
	}
	return {
		fields,
		subscriptions,
		reads: builder.reads,
		owners: builder.owners,
		named: (name) => builder.named(name),
	}
}

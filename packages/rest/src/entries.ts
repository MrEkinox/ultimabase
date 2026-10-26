// The models REST serves (D-129): each model's plural and limits, named and
// bounded as GraphQL names and bounds them (D-107).
import type { ExposedModel, SchemaField, SchemaModel } from 'ultimabase'
import { Refused } from 'ultimabase'

/** A model's key of `.with` (D-129). */
export type RestWith =
	{ readonly plural?: string; readonly maxTake?: number } | false

export type Args = { readonly [key: string]: unknown }

export type Entry = {
	readonly exposed: ExposedModel<RestWith>
	readonly model: SchemaModel
	/** Routed; a hidden model is read and connected through relations only. */
	readonly visible: boolean
	readonly plural: string
	/** The rows a list returns without `first`, `last` or `take`. */
	readonly take: number
	readonly maxTake: number
}

/** What every route reads: the models and the plugin's settings. */
export type Api = {
	readonly entries: ReadonlyMap<string, Entry>
	readonly pagination: 'connection' | 'list'
	readonly take: number
	readonly maxDepth: number
	readonly maxRows: number
}

export function entryOf(api: Api, model: string): Entry {
	const entry = api.entries.get(model)
	if (entry === undefined) throw new Error(`Unknown model ${model}.`)
	return entry
}

/** `post` → `posts`, `category` → `categories`, `box` → `boxes`, as GraphQL. */
export function plural(name: string): string {
	if (/[^aeiou]y$/i.test(name)) return `${name.slice(0, -1)}ies`
	if (/(?:s|x|z|ch|sh)$/i.test(name)) return `${name}es`
	return `${name}s`
}

/** Stops startup on a route name GraphQL would refuse as a field name. */
export function checkName(name: string, where: string): string {
	if (/^[_A-Za-z][_0-9A-Za-z]*$/.test(name) && !name.startsWith('__')) {
		return name
	}
	throw new Refused(`${where}: ${name} is not a route name.`)
}

/** `id`, `createdAt` and `updatedAt`, which every model has (D-22). */
export const system: readonly string[] = ['id', 'createdAt', 'updatedAt']

/** The fields a client reads: no `private` one, for Master too (D-44). */
export const readable = (entry: Entry): readonly SchemaField[] =>
	entry.model.fields.filter(
		(field) => entry.exposed.readRules[field.name] !== 'private',
	)

/** Each model's entry; two routed models of one plural stop startup. */
export function entriesOf(
	models: readonly ExposedModel<RestWith>[],
	options: { readonly take?: number; readonly maxTake?: number },
): ReadonlyMap<string, Entry> {
	const take = options.take ?? 100
	const entries = new Map<string, Entry>()
	const owners = new Map<string, string>()
	for (const exposed of models) {
		const name = exposed.schema.name
		const own = exposed.with === false ? {} : (exposed.with ?? {})
		const given =
			own.plural ?? plural(name.charAt(0).toLowerCase() + name.slice(1))
		const entry = {
			exposed,
			model: exposed.schema,
			visible: exposed.with !== false,
			plural: checkName(given, name),
			take,
			maxTake: own.maxTake ?? options.maxTake ?? 100,
		}
		entries.set(name, entry)
		if (!entry.visible) continue
		const other = given === 'functions' ? 'the functions' : owners.get(given)
		if (other !== undefined) {
			throw new Refused(
				`${name}: the route ${given} is ${other}'s; set .with({ rest: { plural } }).`,
			)
		}
		owners.set(given, name)
	}
	return entries
}

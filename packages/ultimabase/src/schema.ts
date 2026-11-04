// The schema `start` resolves from the application's models, with each
// relation's inverse and the side that stores its key (D-37, D-54, D-64).
import type { Schema, SchemaField, SchemaModel } from './adapter.ts'
import type {
	Codec,
	FieldDefinition,
	FieldOptions,
	ModelDefinition,
	PluginCode,
	PluginUse,
} from './definition.ts'
import type { Digits } from './decimal.ts'
import type { Enum } from './fields.ts'
import { modelDefinitions } from './definition.ts'
import { Refused } from './errors.ts'
import { installedUses } from './plugin-use.ts'
import { checkRelations, isFiltered, viewField } from './relations.ts'
import { checkIndexes, checkSearch } from './schema-indexes.ts'
import type { Linked } from './schema-relations.ts'
import { inverseOf, relationField } from './schema-relations.ts'
import type { VirtualInfo } from './schema-virtuals.ts'
import { virtualsOf } from './schema-virtuals.ts'
import { checkWithin } from './within-schema.ts'

/**
 * A field as the kernel reads it: its schema, its builder's options, a
 * plugin field type's codec (D-122) and its shared enum (D-150).
 */
export type FieldInfo = SchemaField & {
	readonly options: FieldOptions
	readonly codec?: Codec
	readonly enum?: Enum
}

export type ModelInfo = {
	readonly name: string
	readonly definition: ModelDefinition
	readonly fields: ReadonlyMap<string, FieldInfo>
	/** The unique targets (D-52): `id`, unique fields, unique indexes. */
	readonly uniques: readonly (readonly string[])[]
	/** The plugins of its `use`, in the order of `plugins` (D-29). */
	readonly plugins: readonly PluginUse[]
	/** The plugin whose own model it is, if one (D-110). */
	readonly owner: string | undefined
	/** Whether a plugin of its `use` makes it the user model (D-189). */
	readonly users: boolean
	/** Its fields computed on read, which the adapter never sees (D-151). */
	readonly virtuals: ReadonlyMap<string, VirtualInfo>
}

export type Resolved = {
	readonly schema: Schema
	readonly models: ReadonlyMap<string, ModelInfo>
	/** The model each `defineModel` value stands for. */
	readonly byValue: ReadonlyMap<object, ModelInfo>
}

function fail(message: string): never {
	throw new Refused(message)
}

/** A decimal's precision and scale, which its builder checked (D-145). */
const digitsOf = (options: FieldOptions): Digits => ({
	precision: Number(options['precision']),
	scale: Number(options['scale']),
})

function scalarField(name: string, field: FieldDefinition): FieldInfo {
	if (field.kind !== 'scalar') throw new Error('Expected a scalar field.')
	const dbName = field.options['dbName']
	// A field type's default is a value code sees, never a column's; its
	// stored field's fills the rows stored before it (D-122, D-152).
	const fixed: unknown =
		field.codec === undefined ? field.options['default'] : field.codec.filled
	return {
		kind: 'scalar',
		name,
		type: field.type,
		...(field.values === undefined ? {} : { values: field.values }),
		list: field.options['list'] === true,
		...(field.type === 'number' && field.options['integer'] === true
			? { integer: true }
			: {}),
		...(field.type === 'decimal' ? digitsOf(field.options) : {}),
		optional: field.options['optional'] === true,
		unique: field.options['unique'] === true,
		...(field.options['search'] === true ? { search: true } : {}),
		...(typeof dbName === 'string' ? { dbName } : {}),
		// `null` is no value: a create without one stores none either.
		...(fixed === undefined || fixed === null || typeof fixed === 'function'
			? {}
			: { default: fixed }),
		options: field.options,
		...(field.codec === undefined ? {} : { codec: field.codec }),
		...(field.enum === undefined ? {} : { enum: field.enum }),
	}
}

/** A string unique regardless of case (D-170). */
const insensitive = (field: FieldInfo): boolean =>
	field.kind === 'scalar' && field.options['unique'] === 'insensitive'

/** A field as the adapter reads it, without the builder's options. */
function schemaField(model: ModelInfo, field: FieldInfo): SchemaField {
	const { options: _options, codec: _codec, enum: _enum, ...schema } = field
	if (schema.kind !== 'many' || !isFiltered(model, field.name)) return schema
	return { ...schema, filtered: true }
}

const whose = (owner: string | undefined): string =>
	owner === undefined ? 'models lists' : `${owner}.models lists`

/** The models, the application's then each plugin's, by name (D-110). */
function definitionsOf(
	values: readonly unknown[],
	plugins: readonly PluginCode[],
): {
	readonly definitions: ReadonlyMap<string, ModelDefinition>
	readonly names: ReadonlyMap<object, string>
	readonly owners: ReadonlyMap<string, string | undefined>
} {
	const definitions = new Map<string, ModelDefinition>()
	const names = new Map<object, string>()
	const owners = new Map<string, string | undefined>()
	const lists: [string | undefined, readonly unknown[]][] = [
		[undefined, values],
		...plugins.map((code): [string, readonly unknown[]] => [
			code.name,
			code.models,
		]),
	]
	for (const [owner, list] of lists) {
		for (const value of list) {
			const definition =
				typeof value === 'object' && value !== null
					? modelDefinitions.get(value)
					: undefined
			if (
				definition === undefined ||
				typeof value !== 'object' ||
				value === null
			) {
				throw new Refused(
					`${whose(owner)} a value that defineModel did not return.`,
				)
			}
			const { name } = definition
			if (owners.has(name)) {
				const other = owners.get(name)
				throw new Refused(
					owner === other
						? `${whose(owner)} two models named ${name}.`
						: `${whose(owner)} a model named ${name}, as ${whose(other)}; name a plugin's models after it.`,
				)
			}
			definitions.set(name, definition)
			names.set(value, name)
			owners.set(name, owner)
		}
	}
	return { definitions, names, owners }
}

const linkOf = (list: readonly Linked[], model: string, name: string) =>
	list.find((each) => each.model === model && each.name === name)

/** Resolves the application's models, or stops startup with a message. */
export function resolve(
	values: readonly unknown[],
	plugins: readonly PluginCode[] = [],
): Resolved {
	const { definitions, names, owners } = definitionsOf(values, plugins)
	const links: Linked[] = []
	const views: Linked[] = []
	for (const [model, definition] of definitions) {
		for (const [name, field] of definition.fields) {
			if (field.kind === 'scalar' || field.kind === 'virtual') continue
			const value = field.target()
			const target =
				typeof value === 'object' && value !== null
					? names.get(value)
					: undefined
			if (target === undefined) {
				throw new Refused(`${model}.${name}: its target is not in models.`)
			}
			const owner = owners.get(model)
			if (owner !== owners.get(target)) {
				throw new Refused(
					`${model}.${name}: a plugin's model relates only to models of the same plugin; keep the id as a scalar.`,
				)
			}
			// A view reads the link of another relation (D-151).
			const from = field.kind === 'many' ? field.options['from'] : undefined
			const link = { model, name, field, target }
			;(typeof from === 'string' ? views : links).push(link)
		}
	}
	const inverses = new Map(links.map((link) => [link, inverseOf(link, links)]))
	for (const [link, inverse] of inverses) {
		if (inverses.get(inverse) !== link) {
			fail(
				`${link.model}.${link.name} and ${inverse.model}.${inverse.name} do not name each other.`,
			)
		}
	}
	const relationOf = (model: string, name: string): FieldInfo | undefined => {
		const link = linkOf(links, model, name)
		const inverse = link && inverses.get(link)
		return link && inverse ? relationField(link, inverse) : undefined
	}
	const fieldOf = (model: string, name: string, field: FieldDefinition) => {
		const view = linkOf(views, model, name)
		if (view === undefined) {
			return relationOf(model, name) ?? scalarField(name, field)
		}
		const from = String(field.options['from'])
		return viewField(
			{ model, name, target: view.target, options: field.options },
			from,
			linkOf(views, model, from) ? 'view' : relationOf(model, from),
		)
	}
	const models = new Map<string, ModelInfo>()
	const byValue = new Map<object, ModelInfo>()
	const schemaModels: SchemaModel[] = []
	for (const [model, definition] of definitions) {
		const fields = new Map<string, FieldInfo>()
		for (const [name, field] of definition.fields) {
			// A virtual is no field of the adapter's (D-151).
			if (field.kind === 'virtual') continue
			const plugin = field.kind === 'scalar' ? field.codec?.plugin : undefined
			if (plugin !== undefined && !plugins.some((p) => p.name === plugin)) {
				fail(
					`${model}.${name} is a ${plugin} field, and ${plugin} is not in plugins.`,
				)
			}
			fields.set(name, fieldOf(model, name, field))
		}
		const indexes = checkIndexes(model, fields, definition.indexes)
		const uniques: (readonly string[])[] = [['id']]
		for (const field of fields.values()) {
			if (field.kind === 'scalar' && (field.unique || insensitive(field))) {
				uniques.push([field.name])
			}
		}
		// A partial index is no target: rows outside it share values (D-215).
		for (const index of indexes) {
			if (index.unique && index.where === undefined) uniques.push(index.fields)
		}
		const uses = installedUses(definition, plugins)
		const info: ModelInfo = {
			name: model,
			definition,
			fields,
			uniques,
			plugins: uses,
			owner: owners.get(model),
			users: uses.some((use) => use.code.userModel),
			virtuals: virtualsOf(model, definition, fields, names),
		}
		checkSearch(info)
		checkRelations(info)
		models.set(model, info)
		schemaModels.push({
			name: model,
			...(definition.dbName === undefined ? {} : { dbName: definition.dbName }),
			fields: [...fields.values()].map((field) => schemaField(info, field)),
			indexes: [
				...indexes,
				// A field's own comes as its index (D-170).
				...[...fields.values()].filter(insensitive).map((field) => ({
					fields: [field.name],
					unique: true,
					contains: false,
					mode: 'insensitive' as const,
				})),
			],
		})
	}
	checkWithin(models)
	const users = [...models.values()].filter((info) => info.users)
	if (users.length > 1) {
		fail(
			`${users.map((info) => info.name).join(' and ')} each use a plugin of the user model; one model does.`,
		)
	}
	for (const [value, name] of names) {
		const info = models.get(name)
		if (info !== undefined) byValue.set(value, info)
	}
	return { schema: { models: schemaModels }, models, byValue }
}

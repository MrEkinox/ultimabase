// The schema `start` resolves from the application's models: each relation
// gets its inverse and the side that stores its key (D-37, D-54, D-64).
import type { Schema, SchemaField, SchemaModel } from './adapter.ts'
import type {
	FieldDefinition,
	FieldOptions,
	IndexDefinition,
	ModelDefinition,
	PluginCode,
	PluginUse,
} from './definition.ts'
import { modelDefinitions } from './definition.ts'
import { Refused } from './errors.ts'

/** A field as the kernel reads it: its schema and its builder's options. */
export type FieldInfo = SchemaField & { readonly options: FieldOptions }

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
}

export type Resolved = {
	readonly schema: Schema
	readonly models: ReadonlyMap<string, ModelInfo>
	/** The model each `defineModel` value stands for. */
	readonly byValue: ReadonlyMap<object, ModelInfo>
}

type Relation = Extract<FieldDefinition, { readonly kind: 'one' | 'many' }>
type Linked = {
	readonly model: string
	readonly name: string
	readonly field: Relation
	readonly target: string
}

function fail(message: string): never {
	throw new Refused(message)
}

function inverseOf(link: Linked, links: readonly Linked[]): Linked {
	const { model, name, target } = link
	const where = `${model}.${name}`
	const named = link.field.options['inverse']
	const back = links.filter(
		(other) =>
			other.model === target &&
			other.target === model &&
			!(other.model === model && other.name === name),
	)
	if (typeof named === 'string') {
		const found = links.find(
			(other) => other.model === target && other.name === named,
		)
		if (found === undefined || found.target !== model) {
			fail(
				`${where}: inverse '${named}' is not a relation of ${target} to ${model}.`,
			)
		}
		if (found.model === model && found.name === name) {
			fail(`${where} cannot be its own inverse.`)
		}
		return found
	}
	const candidates = back.filter((other) => {
		const theirs = other.field.options['inverse']
		return typeof theirs !== 'string' || theirs === name
	})
	const [only, ...others] = candidates
	if (only === undefined) {
		fail(`${where}: ${target} has no relation to ${model}; add its side.`)
	}
	if (others.length > 0) {
		fail(
			`${where}: ${target} has several relations to ${model}; name one with \`inverse\`.`,
		)
	}
	return only
}

function relationField(link: Linked, inverse: Linked): FieldInfo {
	const { field } = link
	const optional = field.options['optional'] === true
	const where = `${link.model}.${link.name}`
	if (field.kind === 'many') {
		return {
			kind: 'many',
			name: link.name,
			target: link.target,
			inverse: inverse.name,
			join: inverse.field.kind === 'many',
			options: field.options,
		}
	}
	let stored = inverse.field.kind === 'many'
	if (inverse.field.kind === 'one') {
		const theirs = inverse.field.options['optional'] === true
		if (optional === theirs) {
			fail(
				`${where} and ${inverse.model}.${inverse.name}: make one side of a one-to-one relation optional.`,
			)
		}
		stored = !optional
	}
	const asked = field.options['onDelete']
	if (!stored && asked !== undefined) {
		fail(
			`${where}: onDelete belongs on ${inverse.model}.${inverse.name}, which stores the key.`,
		)
	}
	if (asked === 'setNull' && !optional) {
		throw new Refused(`${where}: setNull needs an optional relation.`)
	}
	const onDelete =
		asked === 'cascade' || asked === 'restrict' || asked === 'setNull'
			? asked
			: optional
				? 'setNull'
				: 'restrict'
	const dbName = field.options['dbName']
	return {
		kind: 'one',
		name: link.name,
		target: link.target,
		inverse: inverse.name,
		stored,
		unique: stored && inverse.field.kind === 'one',
		optional,
		onDelete,
		...(typeof dbName === 'string' ? { dbName } : {}),
		options: field.options,
	}
}

function scalarField(name: string, field: FieldDefinition): FieldInfo {
	if (field.kind !== 'scalar') throw new Error('Expected a scalar field.')
	const dbName = field.options['dbName']
	const fixed: unknown = field.options['default']
	return {
		kind: 'scalar',
		name,
		type: field.type,
		...(field.values === undefined ? {} : { values: field.values }),
		optional: field.options['optional'] === true,
		unique: field.options['unique'] === true,
		...(typeof dbName === 'string' ? { dbName } : {}),
		// `null` is no value: a create without one stores none either.
		...(fixed === undefined || fixed === null || typeof fixed === 'function'
			? {}
			: { default: fixed }),
		options: field.options,
	}
}

/** A field as the adapter reads it, without the builder's options. */
function schemaField(field: FieldInfo): SchemaField {
	const { options: _options, ...schema } = field
	return schema
}

/** Stops startup when `owner` uses a plugin that `plugins` does not hold. */
export function checkInstalled(
	owner: string,
	code: PluginCode,
	plugins: readonly PluginCode[],
): void {
	if (plugins.includes(code)) return
	const { name } = code
	const other = plugins.some((each) => each.name === name)
	throw new Refused(
		other
			? `${owner} uses a ${name} from another definePlugin than the one in plugins.`
			: `${owner} uses ${name}, which is not in plugins.`,
	)
}

/** A model's plugins in the order of `plugins`, each one installed. */
function installedUses(
	definition: ModelDefinition,
	plugins: readonly PluginCode[],
): readonly PluginUse[] {
	const at = (use: PluginUse) => plugins.indexOf(use.code)
	for (const use of definition.uses) {
		checkInstalled(definition.name, use.code, plugins)
	}
	return definition.uses.toSorted((a, b) => at(a) - at(b))
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

/** An index on a list is a GIN index of that list alone (D-120). */
function listIndex(model: string, name: string, index: IndexDefinition): void {
	if (index.fields.length > 1) {
		throw new Refused(
			`${model}: the list '${name}' is indexed alone, in an index of its own.`,
		)
	}
	if (index.unique === true) {
		throw new Refused(`${model}: the list '${name}' cannot be unique.`)
	}
}

/** Resolves the application's models, or stops startup with a message. */
export function resolve(
	values: readonly unknown[],
	plugins: readonly PluginCode[] = [],
): Resolved {
	const { definitions, names, owners } = definitionsOf(values, plugins)
	const links: Linked[] = []
	for (const [model, definition] of definitions) {
		for (const [name, field] of definition.fields) {
			if (field.kind === 'scalar') continue
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
			links.push({ model, name, field, target })
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
	const models = new Map<string, ModelInfo>()
	const byValue = new Map<object, ModelInfo>()
	const schemaModels: SchemaModel[] = []
	for (const [model, definition] of definitions) {
		const fields = new Map<string, FieldInfo>()
		for (const [name, field] of definition.fields) {
			const link = links.find(
				(each) => each.model === model && each.name === name,
			)
			const inverse = link && inverses.get(link)
			fields.set(
				name,
				link && inverse
					? relationField(link, inverse)
					: scalarField(name, field),
			)
		}
		for (const index of definition.indexes) {
			for (const name of index.fields) {
				const field = fields.get(name)
				if (
					field === undefined ||
					field.kind === 'many' ||
					(field.kind === 'one' && !field.stored)
				) {
					throw new Refused(
						`${model}: index field '${name}' is not a scalar or a stored one relation.`,
					)
				}
				if (field.kind === 'scalar' && field.type === 'stringList') {
					listIndex(model, name, index)
				}
			}
		}
		const uniques: (readonly string[])[] = [['id']]
		for (const field of fields.values()) {
			if (field.kind === 'scalar' && field.unique) uniques.push([field.name])
		}
		for (const index of definition.indexes) {
			if (index.unique === true) uniques.push(index.fields)
		}
		const info: ModelInfo = {
			name: model,
			definition,
			fields,
			uniques,
			plugins: installedUses(definition, plugins),
			owner: owners.get(model),
		}
		models.set(model, info)
		schemaModels.push({
			name: model,
			...(definition.dbName === undefined ? {} : { dbName: definition.dbName }),
			fields: [...fields.values()].map(schemaField),
			indexes: definition.indexes.map((index) => ({
				fields: index.fields,
				unique: index.unique === true,
			})),
		})
	}
	for (const [value, name] of names) {
		const info = models.get(name)
		if (info !== undefined) byValue.set(value, info)
	}
	return { schema: { models: schemaModels }, models, byValue }
}

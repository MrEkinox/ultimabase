// A model's plugins at `defineModel` (D-89): the entries of its `use`, the
// fields they add and the commands they build, which run in their command.
import type {
	FieldDefinition,
	IndexDefinition,
	PluginRecord,
	PluginUse,
} from './definition.ts'
import { fieldBuilders, fieldDefinitions, pluginEntries } from './definition.ts'
import type { Command } from './plugin-code.ts'
import { inCommand } from './plugin-code.ts'
import { isObject, systemFields } from './query-where.ts'
import { Refused } from './errors.ts'

/** The kernel's names, which a model's field cannot take (D-22, D-20, D-134). */
const reserved = new Set([...systemFields, 'AND', 'OR', 'NOT', '_count'])

/**
 * Adds the fields a `fields` callback, or a plugin's `addedFields`, built.
 * `owners` names the plugin that added each field.
 */
export function addFields(
	model: string,
	built: unknown,
	fields: Map<string, FieldDefinition>,
	owners: Map<string, string>,
	plugin?: string,
): void {
	if (!isObject(built)) {
		const part = plugin === undefined ? 'fields' : `${plugin}.addedFields`
		throw new Refused(`${model}: ${part} must return an object of fields.`)
	}
	for (const [field, value] of Object.entries(built)) {
		const recorded =
			typeof value === 'object' && value !== null
				? fieldDefinitions.get(value)
				: undefined
		if (recorded === undefined) {
			throw new Refused(`${model}.${field} is not a field a builder returned.`)
		}
		if (reserved.has(field)) {
			throw new Refused(`${model}.${field}: the kernel owns this name.`)
		}
		if (plugin !== undefined && fields.has(field)) {
			const owner = owners.get(field) ?? model
			throw new Refused(
				`${model}.${field}: ${plugin} adds a field ${owner} already has.`,
			)
		}
		fields.set(field, recorded)
		if (plugin !== undefined) owners.set(field, plugin)
	}
}

/** Runs a command's function, or each function of its object, as it. */
function wrapped(value: unknown, command: Command, path: string): unknown {
	const run =
		(fn: Function) =>
		(...args: unknown[]): unknown =>
			inCommand(command, () => {
				const result: unknown = Reflect.apply(fn, undefined, args)
				return result
			})
	if (typeof value === 'function') return run(value)
	const refused = new TypeError(
		`${path} is a function or an object of functions.`,
	)
	if (!isObject(value)) throw refused
	const functions: { [key: string]: unknown } = {}
	for (const [key, fn] of Object.entries(value)) {
		if (typeof fn !== 'function') throw refused
		functions[key] = run(fn)
	}
	return Object.freeze(functions)
}

function commandsOf(
	model: string,
	uses: readonly PluginUse[],
	methods: ReadonlySet<string>,
): ReadonlyMap<string, unknown> {
	const commands = new Map<string, unknown>()
	const owners = new Map<string, string>()
	for (const { code, model: given } of uses) {
		if (code.commands === undefined) continue
		const built: unknown = Reflect.apply(code.commands, undefined, [given])
		if (!isObject(built)) {
			throw new TypeError(`${code.name}.commands returns an object.`)
		}
		for (const [command, value] of Object.entries(built)) {
			const path = `${model}.${command}`
			if (methods.has(command)) {
				throw new Refused(
					`${path}: ${code.name} adds a command named after a model method.`,
				)
			}
			const other = owners.get(command)
			if (other !== undefined) {
				throw new Refused(
					`${path}: ${other} and ${code.name} both add this command.`,
				)
			}
			owners.set(command, code.name)
			const running = { model, plugin: code.name, command }
			commands.set(command, wrapped(value, running, path))
		}
	}
	return commands
}

/**
 * Reads a model's `use`: each entry once, the fields its plugins add into
 * `fields`, and their commands, built with `queries`.
 */
/** The plugin entries `use` lists, each once (D-27). */
export function entriesOf(name: string, use: unknown): readonly PluginRecord[] {
	if (!Array.isArray(use)) throw new Refused(`${name}.use is a list.`)
	const entries: PluginRecord[] = []
	for (const value of use) {
		const entry = isObject(value) ? pluginEntries.get(value) : undefined
		if (entry === undefined) {
			throw new Refused(`${name}.use lists a value no plugin's entry returned.`)
		}
		if (entries.some((other) => other.code.name === entry.code.name)) {
			throw new Refused(`${name}.use lists ${entry.code.name} twice.`)
		}
		entries.push(entry)
	}
	return entries
}

export function usedBy(
	model: string,
	use: readonly unknown[],
	fields: Map<string, FieldDefinition>,
	queries: object,
): {
	readonly uses: readonly PluginUse[]
	readonly commands: ReadonlyMap<string, unknown>
	readonly indexes: readonly IndexDefinition[]
} {
	const uses: PluginUse[] = []
	const owners = new Map<string, string>()
	for (const { code, options } of entriesOf(model, use)) {
		if (code.addedFields !== undefined) {
			const built: unknown = Reflect.apply(code.addedFields, undefined, [
				fieldBuilders,
				options,
			])
			addFields(model, built, fields, owners, code.name)
		}
		const given = { queries, options, plugins: code.plugins }
		uses.push({ code, model: Object.freeze(given) })
	}
	const redirecting = uses.filter((each) => each.code.redirect !== undefined)
	if (redirecting.length > 1) {
		const names = redirecting.map((each) => each.code.name).join(' and ')
		throw new Refused(`${model}: ${names} both redirect delete.`)
	}
	const methods = new Set(['name', 'with', 'nullable', ...Object.keys(queries)])
	return {
		uses,
		commands: commandsOf(model, uses, methods),
		indexes: uses.flatMap(({ code }) => code.addedIndexes),
	}
}

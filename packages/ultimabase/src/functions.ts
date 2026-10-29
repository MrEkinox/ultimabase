// The application's and the plugins' functions at `start` (D-27, D-109,
// D-113): each named once, its plugins installed, the models it returns in
// `models`, and each type named once, apart from the models.
import type {
	FunctionDefinition,
	Output,
	PluginCode,
	TypeDefinition,
} from './definition.ts'
import { called } from './define-function.ts'
import type { Client } from './function.ts'
import { functionDefinitions } from './definition.ts'
import type { ExposedFunction } from './plugin.ts'
import { isObject } from './query-where.ts'
import type { Resolved } from './schema.ts'
import { checkInstalled } from './plugin-use.ts'
import { Refused } from './errors.ts'

/** Checks the models and types an output reaches, each type once. */
function checkOutput(
	name: string,
	output: Output,
	resolved: Resolved,
	types: Map<string, TypeDefinition>,
): void {
	if (output.kind === 'schema') return
	if (output.kind === 'model') {
		const info = resolved.byValue.get(output.value)
		if (info === undefined) {
			throw new Refused(
				`${name} returns ${output.name}, which is not in models.`,
			)
		}
		if (info.owner === undefined) return
		throw new Refused(
			`${name} returns ${output.name}, a model of ${info.owner}.`,
		)
	}
	const { type } = output
	const known = types.get(type.name)
	if (known === type) return
	if (known !== undefined) {
		throw new Refused(`Two types are named ${type.name}; name each once.`)
	}
	if (resolved.models.has(type.name)) {
		throw new Refused(`The type ${type.name} is named like a model.`)
	}
	types.set(type.name, type)
	for (const field of type.fields.values()) {
		checkOutput(name, field, resolved, types)
	}
}

/** Functions listed by the application, or given by a plugin (D-113). */
export type FunctionSource = {
	readonly plugin: string | undefined
	readonly values: readonly unknown[]
}

/** The application's and the plugins' functions, by value, and who gives each. */
export type Functions = {
	readonly definitions: ReadonlyMap<object, FunctionDefinition>
	readonly plugins: ReadonlyMap<object, string>
}

const ownerOf = (plugin: string | undefined, name: string): string =>
	plugin === undefined
		? `the application's function ${name}`
		: `${plugin}'s function ${name}`

/** The functions, each named once, or startup stops with a message. */
export function resolveFunctions(
	sources: readonly FunctionSource[],
	resolved: Resolved,
	plugins: readonly PluginCode[],
): Functions {
	const definitions = new Map<object, FunctionDefinition>()
	const owners = new Map<object, string>()
	const names = new Map<string, string>()
	const types = new Map<string, TypeDefinition>()
	for (const { plugin, values } of sources) {
		const where = plugin === undefined ? 'functions' : `${plugin}.functions`
		for (const value of values) {
			const definition = isObject(value)
				? functionDefinitions.get(value)
				: undefined
			if (definition === undefined || !isObject(value)) {
				throw new Refused(
					`${where} lists a value that defineFunction did not return.`,
				)
			}
			const { name } = definition
			const owner = ownerOf(plugin, name)
			const other = names.get(name)
			if (other !== undefined) {
				throw new Refused(
					other === owner
						? `${where} lists two functions named ${name}.`
						: `${owner} and ${other} are both named ${name}.`,
				)
			}
			names.set(name, owner)
			for (const use of definition.uses) {
				checkInstalled(name, use.code, plugins)
			}
			if (definition.output !== undefined) {
				checkOutput(name, definition.output, resolved, types)
			}
			definitions.set(value, definition)
			if (plugin !== undefined) owners.set(value, plugin)
		}
	}
	// A virtual's type is named once with the functions' (D-151).
	for (const info of resolved.byValue.values()) {
		for (const { name, output } of info.virtuals.values()) {
			if (output.kind !== 'type') continue
			checkOutput(`${info.name}.${name}`, output, resolved, types)
		}
	}
	return { definitions, plugins: owners }
}

/** The functions as the plugin `name` reads them, with its `.with` key. */
export function exposedFunctions(
	name: string,
	functions: Functions,
): readonly ExposedFunction[] {
	return [...functions.definitions].map(([value, record]) => {
		const { rules, input } = record
		const key: unknown =
			rules === undefined ? undefined : Reflect.get(rules, name)
		return Object.freeze({
			name: record.name,
			description: record.description,
			plugin: functions.plugins.get(value),
			query: record.query,
			used: record.uses.some((use) => use.code.name === name),
			input,
			output: record.output,
			with: key,
			run: async (
				given: unknown,
				options: unknown,
				client?: Client,
			): Promise<unknown> =>
				called(
					value,
					record,
					input === undefined ? [options] : [given, options],
					client,
				),
		})
	})
}

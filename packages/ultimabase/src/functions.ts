// The application's functions at `start` (D-27, D-109): each named once,
// its plugins installed, the models it returns in `models`, and each type
// named once, apart from the models.
import type {
	FunctionDefinition,
	Output,
	PluginCode,
	TypeDefinition,
} from './definition.ts'
import { called } from './define-function.ts'
import { functionDefinitions } from './definition.ts'
import type { ExposedFunction } from './plugin.ts'
import { isObject } from './query-where.ts'
import type { Resolved } from './schema.ts'
import { checkInstalled } from './schema.ts'

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
			throw new Error(`${name} returns ${output.name}, which is not in models.`)
		}
		if (info.owner === undefined) return
		throw new Error(
			`${name} returns ${output.name}, a model of ${info.owner} (D-110).`,
		)
	}
	const { type } = output
	const known = types.get(type.name)
	if (known === type) return
	if (known !== undefined) {
		throw new Error(`Two types are named ${type.name}; name each once (D-109).`)
	}
	if (resolved.models.has(type.name)) {
		throw new Error(`The type ${type.name} is named like a model (D-109).`)
	}
	types.set(type.name, type)
	for (const field of type.fields.values()) {
		checkOutput(name, field, resolved, types)
	}
}

/** The application's functions, by value, or startup stops with a message. */
export function resolveFunctions(
	values: readonly unknown[],
	resolved: Resolved,
	plugins: readonly PluginCode[],
): ReadonlyMap<object, FunctionDefinition> {
	const functions = new Map<object, FunctionDefinition>()
	const names = new Set<string>()
	const types = new Map<string, TypeDefinition>()
	for (const value of values) {
		const definition = isObject(value)
			? functionDefinitions.get(value)
			: undefined
		if (definition === undefined || !isObject(value)) {
			throw new Error(
				'functions lists a value that defineFunction did not return.',
			)
		}
		const { name } = definition
		if (names.has(name)) {
			throw new Error(`functions lists two functions named ${name}.`)
		}
		names.add(name)
		for (const use of definition.uses) checkInstalled(name, use.code, plugins)
		if (definition.output !== undefined) {
			checkOutput(name, definition.output, resolved, types)
		}
		functions.set(value, definition)
	}
	return functions
}

/** The functions as the plugin `name` reads them, with its `.with` key. */
export function exposedFunctions(
	name: string,
	functions: ReadonlyMap<object, FunctionDefinition>,
): readonly ExposedFunction[] {
	return [...functions].map(([value, record]) => {
		const { rules, input } = record
		const key: unknown =
			rules === undefined ? undefined : Reflect.get(rules, name)
		return Object.freeze({
			name: record.name,
			query: record.query,
			input,
			output: record.output,
			with: key,
			run: async (given: unknown, options: unknown): Promise<unknown> =>
				called(
					value,
					record,
					input === undefined ? [options] : [given, options],
				),
		})
	})
}

// The application's plugins at `start` (D-16, D-89): their values checked,
// their requirements met, then their APIs built, each after those it needs.
import type { SchemaModel } from './adapter.ts'
import { readRules } from './access.ts'
import type { Logger } from './app-options.ts'
import type { PluginRecord } from './definition.ts'
import type { FunctionSource, Functions } from './functions.ts'
import type { Identify, PluginIdentify } from './identify.ts'
import type { Caller } from './rules.ts'
import type { ExposedFunction, ExposedModel, ModelQueries } from './plugin.ts'
import type { ModelShape } from './model.ts'
import type { ModelInfo, Resolved } from './schema.ts'
import { pluginValues } from './definition.ts'
import { exposedFunctions, resolveFunctions } from './functions.ts'
import { isObject } from './query-where.ts'
import { Refused } from './errors.ts'

/** Each plugin after the plugins it needs; a cycle stops startup. */
function needsFirst(plugins: readonly PluginRecord[]): readonly PluginRecord[] {
	const byName = new Map(plugins.map((plugin) => [plugin.code.name, plugin]))
	const ordered: PluginRecord[] = []
	const visit = (plugin: PluginRecord, path: readonly string[]): void => {
		if (ordered.includes(plugin)) return
		const { name, requires, optional } = plugin.code
		if (path.includes(name)) {
			const cycle = [...path.slice(path.indexOf(name)), name].join(' → ')
			throw new Refused(`plugins need each other: ${cycle}.`)
		}
		for (const needed of [...requires, ...optional]) {
			const other = byName.get(needed)
			if (other !== undefined) visit(other, [...path, name])
		}
		ordered.push(plugin)
	}
	for (const plugin of plugins) visit(plugin, [])
	return ordered
}

/**
 * The application's `plugins`, in their order (D-29), and the order their
 * APIs are built in, or startup stops with a message.
 */
export function installed(values: readonly unknown[]): {
	readonly plugins: readonly PluginRecord[]
	readonly apiOrder: readonly PluginRecord[]
} {
	const plugins: PluginRecord[] = []
	for (const value of values) {
		const plugin = isObject(value) ? pluginValues.get(value) : undefined
		if (plugin === undefined) {
			throw new Refused('plugins lists a value that no plugin returned.')
		}
		const { name } = plugin.code
		if (plugins.some((other) => other.code.name === name)) {
			throw new Refused(`plugins lists two plugins named ${name}.`)
		}
		plugins.push(plugin)
	}
	for (const { code } of plugins) {
		for (const needed of code.requires) {
			if (plugins.some((other) => other.code.name === needed)) continue
			throw new Refused(
				`${code.name} requires ${needed}, which is not in plugins.`,
			)
		}
	}
	return { plugins, apiOrder: needsFirst(plugins) }
}

/**
 * A plugin and what its `api`, `start` and `stop` receive (D-58, D-91, D-106,
 * D-109).
 */
export type Installed = {
	readonly code: PluginRecord['code']
	readonly context: {
		readonly options: object
		readonly plugins: object
		readonly logger: Logger
		readonly identify: Identify
		readonly models: readonly ExposedModel[]
		readonly functions: readonly ExposedFunction[]
	}
}

/** The models as the plugin `name` reads them, with its `.with` key. */
function exposed(name: string, resolved: Resolved): readonly ExposedModel[] {
	const own = [...resolved.byValue].filter(
		([, info]) => info.owner === undefined,
	)
	return own.map(([value, info]) => {
		const rules = info.definition.rules
		// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a model value holds its queries; transports pass client arguments, which the kernel checks (D-20).
		const queries = value as ModelQueries
		const key: unknown =
			rules === undefined ? undefined : Reflect.get(rules, name)
		return Object.freeze({
			schema: schemaOf(resolved, info.name),
			uniques: info.uniques,
			readRules: readRules(info),
			required: required(info),
			with: key,
			queries,
			// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a `defineModel` value, keyed by it.
			model: value as ModelShape,
		})
	})
}

/** The fields `create` needs, as its type says (D-53). */
function required(info: ModelInfo): readonly string[] {
	return [...info.fields.values()]
		.filter(
			(field) =>
				field.kind !== 'many' &&
				!field.optional &&
				field.options['default'] === undefined,
		)
		.map((field) => field.name)
}

function schemaOf(resolved: Resolved, name: string): SchemaModel {
	const found = resolved.schema.models.find((model) => model.name === name)
	if (found === undefined) throw new Error(`${name} has no schema.`)
	return found
}

/**
 * Each plugin with its context, its logger naming it (D-91), and the
 * functions, the application's then each plugin's (D-113).
 */
export function withContexts(
	apiOrder: readonly PluginRecord[],
	logger: Logger,
	identify: Identify,
	resolved: Resolved,
	appFunctions: readonly unknown[],
): { readonly plugins: readonly Installed[]; readonly functions: Functions } {
	const bases = apiOrder.map(({ code, options }) => ({
		code,
		base: {
			options,
			plugins: code.plugins,
			logger: logger.child({ name: code.name }),
			identify,
			models: exposed(code.name, resolved),
		},
	}))
	const sources: FunctionSource[] = [
		{ plugin: undefined, values: appFunctions },
	]
	for (const { code, base } of bases) {
		if (code.functions === undefined) continue
		const values: unknown = Reflect.apply(code.functions, undefined, [base])
		if (!Array.isArray(values)) {
			throw new TypeError(`${code.name}.functions returns an array.`)
		}
		sources.push({ plugin: code.name, values })
	}
	const functions = resolveFunctions(
		sources,
		resolved,
		apiOrder.map((plugin) => plugin.code),
	)
	const plugins = bases.map(({ code, base }) => ({
		code,
		context: { ...base, functions: exposedFunctions(code.name, functions) },
	}))
	return { plugins, functions }
}

/** Builds each plugin's API into `apis`, in their order (D-16, D-89). */
export function buildApis(
	plugins: readonly Installed[],
	apis: Map<string, unknown>,
): void {
	for (const { code, context } of plugins) {
		if (code.api === undefined) continue
		const api: unknown = Reflect.apply(code.api, undefined, [context])
		apis.set(code.name, api)
	}
}

/** Each plugin's `identify` with its context, in the order of `plugins`. */
export function pluginIdentifiers(
	records: readonly PluginRecord[],
	plugins: readonly Installed[],
): readonly PluginIdentify[] {
	return plugins
		.toSorted(
			(a, b) =>
				records.findIndex((record) => record.code === a.code) -
				records.findIndex((record) => record.code === b.code),
		)
		.flatMap(({ code, context }) => {
			const identify = code.identify
			if (identify === undefined) return []
			return [
				async (request: Request) => {
					const caller: unknown = await Reflect.apply(identify, undefined, [
						request,
						context,
					])
					// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- its type is PluginDefinition's; each query checks its caller (D-19).
					return caller as Caller | undefined
				},
			]
		})
}

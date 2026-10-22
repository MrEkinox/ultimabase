// The application's plugins at `start` (D-16, D-89): their values checked,
// their requirements met, then their APIs built, each after those it needs.
import type { Logger } from './app-options.ts'
import type { PluginRecord } from './definition.ts'
import { pluginValues } from './definition.ts'
import { isObject } from './query-where.ts'

/** Each plugin after the plugins it needs; a cycle stops startup. */
function needsFirst(plugins: readonly PluginRecord[]): readonly PluginRecord[] {
	const byName = new Map(plugins.map((plugin) => [plugin.code.name, plugin]))
	const ordered: PluginRecord[] = []
	const visit = (plugin: PluginRecord, path: readonly string[]): void => {
		if (ordered.includes(plugin)) return
		const { name, requires, optional } = plugin.code
		if (path.includes(name)) {
			const cycle = [...path.slice(path.indexOf(name)), name].join(' → ')
			throw new Error(`plugins need each other: ${cycle} (D-89).`)
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
			throw new Error('plugins lists a value that no plugin returned.')
		}
		const { name } = plugin.code
		if (plugins.some((other) => other.code.name === name)) {
			throw new Error(`plugins lists two plugins named ${name}.`)
		}
		plugins.push(plugin)
	}
	for (const { code } of plugins) {
		for (const needed of code.requires) {
			if (plugins.some((other) => other.code.name === needed)) continue
			throw new Error(
				`${code.name} requires ${needed}, which is not in plugins.`,
			)
		}
	}
	return { plugins, apiOrder: needsFirst(plugins) }
}

/** A plugin and what its `api`, `start` and `stop` receive (D-58, D-91). */
export type Installed = {
	readonly code: PluginRecord['code']
	readonly context: {
		readonly options: object
		readonly plugins: object
		readonly logger: Logger
	}
}

/** Each plugin with its context; its logger names it (D-91). */
export function withContexts(
	apiOrder: readonly PluginRecord[],
	logger: Logger,
): readonly Installed[] {
	return apiOrder.map(({ code, options }) => ({
		code,
		context: {
			options,
			plugins: code.plugins,
			logger: logger.child({ name: code.name }),
		},
	}))
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

// A plugin's code at run time (D-57, D-89): what `definePlugin` checks, the
// APIs it reads once the application starts, and the command it runs in.
import { AsyncLocalStorage } from 'node:async_hooks'
import type { IndexDefinition, PluginCode } from './definition.ts'
import { nameOf } from './definition.ts'
import { manifestOf } from './manifest.ts'
import { isObject } from './query-where.ts'
import { current } from './running.ts'

type Holder = { readonly [key: string]: unknown }

function functionAt(
	holder: Holder,
	key: string,
	path: string,
): Function | undefined {
	const value = holder[key]
	if (value === undefined || typeof value === 'function') return value
	throw new TypeError(`${path} is a function.`)
}

function objectAt(holder: Holder, key: string, path: string): Holder {
	const value = holder[key]
	if (value === undefined) return {}
	if (!isObject(value)) throw new TypeError(`${path} is an object.`)
	return value
}

/** The fixed hooks of D-15. */
export const hookNames = [
	'beforeFind',
	'beforeCreate',
	'beforeUpdate',
	'beforeDelete',
	'afterCreate',
	'afterUpdate',
	'afterDelete',
	'afterCreateCommit',
	'afterUpdateCommit',
	'afterDeleteCommit',
] as const

/** The APIs of `names`, each read from the running application. */
function apisOf(plugin: string, names: readonly string[]): object {
	const plugins = {}
	for (const name of names) {
		Object.defineProperty(plugins, name, {
			enumerable: true,
			get: () => {
				const app = current()
				if (app === undefined) {
					throw new Error(
						`${plugin}: plugins.${name} is read once the application starts.`,
					)
				}
				return app.apis.get(name)
			},
		})
	}
	return Object.freeze(plugins)
}

const isList = (value: unknown): value is readonly unknown[] =>
	Array.isArray(value)

/** `addedIndexes`, each `{ fields, unique?, contains? }`; startup checks the fields. */
function indexesOf(value: unknown, path: string): readonly IndexDefinition[] {
	const indexes = value ?? []
	const valid = (index: unknown): index is IndexDefinition =>
		isObject(index) &&
		isList(index['fields']) &&
		index['fields'].every((field) => typeof field === 'string') &&
		(index['unique'] === undefined || typeof index['unique'] === 'boolean') &&
		(index['contains'] === undefined || index['contains'] === true)
	if (!isList(indexes) || !indexes.every(valid)) {
		throw new TypeError(
			`${path} is a list of { fields, unique?, contains?: true }.`,
		)
	}
	return Object.freeze(
		indexes.map(({ fields, unique, contains }) => ({
			fields: [...fields],
			...(unique === undefined ? {} : { unique }),
			...(contains === undefined ? {} : { contains }),
		})),
	)
}

/** Checks what a plugin's author wrote; the types refuse the rest. */
export function pluginCode(definition: unknown): PluginCode {
	if (!isObject(definition))
		throw new TypeError('definePlugin takes an object.')
	const name = nameOf(definition['name'], 'definePlugin')
	const requires = Object.keys(
		objectAt(definition, 'requires', `${name}.requires`),
	)
	const optional = Object.keys(
		objectAt(definition, 'optional', `${name}.optional`),
	)
	const given = objectAt(definition, 'hooks', `${name}.hooks`)
	const hooks: { [hook: string]: Function | undefined } = {}
	for (const hook of hookNames) {
		hooks[hook] = functionAt(given, hook, `${name}.hooks.${hook}`)
	}
	const redirect = objectAt(definition, 'redirect', `${name}.redirect`)
	const part = (key: string) => functionAt(definition, key, `${name}.${key}`)
	const models: unknown = definition['models'] ?? []
	if (!isList(models)) {
		throw new TypeError(`${name}.models is an array.`)
	}
	return Object.freeze({
		name,
		manifest: manifestOf(definition['manifest'], name),
		requires,
		optional,
		hooks: Object.freeze(hooks),
		redirect: functionAt(redirect, 'delete', `${name}.redirect.delete`),
		commands: part('commands'),
		api: part('api'),
		addedFields: part('addedFields'),
		addedIndexes: indexesOf(definition['addedIndexes'], `${name}.addedIndexes`),
		start: part('start'),
		stop: part('stop'),
		identify: part('identify'),
		caller: part('caller'),
		changed: part('changed'),
		missed: part('missed'),
		functions: part('functions'),
		models: Object.freeze([...models]),
		plugins: apisOf(name, [...requires, ...optional]),
	})
}

export type Command = {
	readonly model: string
	readonly plugin: string
	readonly command: string
}

const commands = new AsyncLocalStorage<Command>()

/** The command of `plugin` running on `model`, if any (D-89). */
export function commandOf(model: string, plugin: string): string | undefined {
	const running = commands.getStore()
	return running?.model === model && running.plugin === plugin
		? running.command
		: undefined
}

/** Runs `run` as `plugin`'s command `command` on `model`. */
export function inCommand<R>(command: Command, run: () => R): R {
	return commands.run(command, run)
}

/** Runs a hook's body: the queries it makes run outside any command. */
export function outsideCommands<R>(run: () => R): R {
	return commands.exit(run)
}

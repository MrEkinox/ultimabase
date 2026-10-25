// `ultimabase.config.ts` (D-105): where the commands find the application.
import { existsSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Internals } from './app-internals.ts'
import { internalsOf } from './app-internals.ts'
import { Refused } from './errors.ts'

const names = [
	'ultimabase.config.ts',
	'ultimabase.config.mts',
	'ultimabase.config.js',
	'ultimabase.config.mjs',
]

/** The config file `--config` names, or the first one in `cwd`. */
export function configPath(cwd: string, given: string | undefined): string {
	if (given !== undefined) {
		const path = resolve(cwd, given)
		if (!existsSync(path)) throw new Refused(`There is no ${path}.`)
		return path
	}
	const found = names.map((name) => join(cwd, name)).find(existsSync)
	if (found === undefined) {
		throw new Refused(
			`There is no ultimabase.config.ts in ${cwd}: write one that default-exports defineApp(...), or pass --config <path>.`,
		)
	}
	return found
}

/** The application the config file default-exports. */
export async function load(path: string): Promise<Internals> {
	const module: unknown = await import(pathToFileURL(path).href)
	const app =
		typeof module === 'object' && module !== null
			? internalsOf(Reflect.get(module, 'default'))
			: undefined
	if (app === undefined) {
		throw new Refused(
			`${basename(path)} does not default-export defineApp(...).`,
		)
	}
	return app
}

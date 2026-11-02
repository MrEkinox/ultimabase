// The files plugins generate (D-201): built from the declared application,
// written by `ultimabase generate` and by `ultimabase dev` as it starts.
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { Refused } from './errors.ts'
import type { Installed } from './plugin-app.ts'

/** A file a plugin generates; its path is read from the current directory. */
export type Generated = { readonly path: string; readonly content: string }

const isGenerated = (value: unknown): value is Generated =>
	typeof value === 'object' &&
	value !== null &&
	typeof Reflect.get(value, 'path') === 'string' &&
	typeof Reflect.get(value, 'content') === 'string'

/** Each plugin's files; a path given twice is refused. */
export function generatedOf(
	plugins: readonly Installed[],
): readonly Generated[] {
	const owners = new Map<string, string>()
	const files: Generated[] = []
	for (const { code, context } of plugins) {
		if (code.generate === undefined) continue
		const given: unknown = Reflect.apply(code.generate, undefined, [context])
		if (!Array.isArray(given) || !given.every(isGenerated)) {
			throw new TypeError(`${code.name}.generate returns { path, content }[].`)
		}
		for (const file of given) {
			const owner = owners.get(resolve(file.path))
			if (owner !== undefined) {
				throw new Refused(
					`${file.path} is generated twice, by ${owner} and ${code.name}.`,
				)
			}
			owners.set(resolve(file.path), code.name)
			files.push(file)
		}
	}
	return files
}

const differs = async ({ path, content }: Generated): Promise<boolean> =>
	(await readFile(resolve(path), 'utf8').catch(() => undefined)) !== content

/** The files whose content differs from what is written, or is missing. */
export async function staleOf(
	files: readonly Generated[],
): Promise<readonly Generated[]> {
	const differing = await Promise.all(files.map(differs))
	return files.filter((_, index) => differing[index] === true)
}

/** Writes the files whose content differs, and returns their paths. */
export async function written(
	files: readonly Generated[],
): Promise<readonly string[]> {
	const stale = await staleOf(files)
	for (const { path, content } of stale) {
		await mkdir(dirname(resolve(path)), { recursive: true })
		await writeFile(resolve(path), content)
	}
	return stale.map(({ path }) => path)
}

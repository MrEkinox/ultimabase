// The files plugins generate (D-201): `ultimabase generate` and its
// `--check`, without the database or any `start`, and `ultimabase dev`
// writing them as it starts.
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Io } from './cli-main.ts'
import { main } from './cli-main.ts'
import type { Logger, PluginTypes } from './index.ts'
import { defineApp, definePlugin, memory } from './index.ts'

const kernel = pathToFileURL(join(import.meta.dirname, 'index.ts')).href
const manifest = {
	name: 'test-plugin',
	version: '1.0.0',
	peerDependencies: { ultimabase: '*' },
}

let dir = ''
let out: string[] = []
let err: string[] = []

const io = (): Io => ({
	cwd: dir,
	out: (text) => out.push(text),
	err: (text) => err.push(text),
	now: () => new Date(),
	interactive: true,
	node: async () => 0,
})

beforeEach(async () => {
	dir = await mkdtemp(join(tmpdir(), 'ultimabase-generate-'))
	out = []
	err = []
})

afterEach(async () => {
	vi.unstubAllEnvs()
	await rm(dir, { recursive: true })
})

/**
 * Writes a config whose plugin `docs` has the `generate` hook given as code,
 * which may read the API of the plugin it needs; its database and its `start`
 * throw, so the command proves it runs neither.
 */
async function config(generate: string): Promise<void> {
	await writeFile(
		join(dir, 'ultimabase.config.ts'),
		[
			`import { defineApp, definePlugin, memory } from '${kernel}'`,
			`const manifest = ${JSON.stringify(manifest)}`,
			`const base = definePlugin({ name: 'base', manifest, api: () => ({ title: 'Models' }) })`,
			`const docs = definePlugin({`,
			`	name: 'docs',`,
			`	manifest,`,
			`	requires: { base: base.plugin },`,
			`	start: () => { throw new Error('docs started') },`,
			`	generate: ${generate},`,
			`})`,
			`const database = { ...memory(), start: () => { throw new Error('database started') } }`,
			`export default defineApp({ database, plugins: [base.plugin(), docs.plugin()], models: [] })`,
		].join('\n'),
	)
}

const models = () => join(dir, 'docs', 'models.md')
const docs = () =>
	`({ plugins }) => [{ path: ${JSON.stringify(models())}, content: '# ' + plugins.base.title + '\\n' }]`

describe('ultimabase generate', () => {
	it('writes each file without the database or a start, then only what changed', async () => {
		await config(docs())
		expect(await main(['generate'], io())).toBe(0)
		expect(err).toEqual([])
		expect(out).toEqual([`Wrote ${models()}.`])
		expect(await readFile(models(), 'utf8')).toBe('# Models\n')
		const before = await stat(models())
		out = []
		expect(await main(['generate'], io())).toBe(0)
		expect(out).toEqual([])
		expect((await stat(models())).mtimeMs).toBe(before.mtimeMs)
	})

	it('names the files out of date with --check, and exits 1 until none is', async () => {
		await config(docs())
		expect(await main(['generate', '--check'], io())).toBe(1)
		expect(out).toEqual([`${models()} is out of date.`])
		await expect(stat(models())).rejects.toThrow('ENOENT')
		await main(['generate'], io())
		out = []
		expect(await main(['generate', '--check'], io())).toBe(0)
		expect(out).toEqual([])
	})

	it('refuses a value that is not a list of files', async () => {
		await config(`() => [{ path: 'docs/models.md' }]`)
		expect(await main(['generate'], io())).toBe(1)
		expect(err.join('\n')).toContain(
			'docs.generate returns { path, content }[].',
		)
	})

	it('refuses two files at one path', async () => {
		const file = JSON.stringify(models())
		await config(
			`() => [{ path: ${file}, content: '' }, { path: ${file}, content: '' }]`,
		)
		expect(await main(['generate'], io())).toBe(1)
		expect(err).toEqual([`${models()} is generated twice, by docs and docs.`])
	})
})

interface Notes extends PluginTypes {
	readonly name: 'notes'
	readonly appOptions: { readonly path: string }
}
const notes = definePlugin<Notes>({
	name: 'notes',
	manifest,
	generate: ({ options }) => [{ path: options.path, content: 'notes\n' }],
})

function recorder(lines: string[]): Logger {
	const logger: Logger = {
		info: (first: string | object) => {
			if (typeof first === 'string') lines.push(first)
		},
		warn: () => undefined,
		error: () => undefined,
		child: () => logger,
	}
	return logger
}

describe('ultimabase dev', () => {
	it('writes the generated files in development only', async () => {
		const path = join(dir, 'notes.md')
		const start = async (environment: string) => {
			vi.stubEnv('NODE_ENV', environment)
			const lines: string[] = []
			const app = defineApp({
				database: memory(),
				plugins: [notes.plugin({ path })],
				models: [],
				logger: recorder(lines),
			})
			await app.start()
			await app.stop()
			return lines.filter((line) => line.startsWith('Wrote '))
		}
		expect(await start('test')).toEqual([])
		await expect(stat(path)).rejects.toThrow('ENOENT')
		expect(await start('development')).toEqual([`Wrote ${path}.`])
		expect(await readFile(path, 'utf8')).toBe('notes\n')
	})
})

// The `ultimabase` command (D-105): the config it finds, `migrate create`,
// `migrate deploy`, `sync`, `start` and `dev`, on a fake database.
import { existsSync } from 'node:fs'
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { load } from './cli-config.ts'
import type { Io } from './cli-main.ts'
import { main, processIo, serve, serveFile } from './cli-main.ts'
import { fakeState, logs } from './test/migrating.ts'

const kernel = pathToFileURL(join(import.meta.dirname, 'index.ts')).href
const fake = pathToFileURL(join(import.meta.dirname, 'test/migrating.ts')).href

let dir = ''
let id = 0
let out: string[] = []
let err: string[] = []
let ran: (readonly string[])[] = []
const environment = process.env['NODE_ENV']

const io = (): Io => ({
	cwd: dir,
	out: (text) => out.push(text),
	err: (text) => err.push(text),
	now: () => new Date(Date.UTC(2026, 9, 22, 12, 30, Number(`${id}`.slice(-2)))),
	node: async (args) => {
		ran.push(args)
		return 7
	},
})

const run = async (...args: string[]) => main(args, io())

beforeEach(async () => {
	dir = await mkdtemp(join(tmpdir(), 'ultimabase-cli-'))
	out = []
	err = []
	ran = []
})

afterEach(async () => {
	process.env['NODE_ENV'] = environment
	await rm(dir, { recursive: true })
})

/**
 * Writes a config whose models are `models` (name to field names, all
 * strings), on the fake database `state`, and returns its file name.
 */
async function config(
	state: string,
	models: Record<string, string[]>,
	options: { file?: string; database?: string } = {},
): Promise<string> {
	id += 1
	const file = options.file ?? `app${id}.config.ts`
	const defined = Object.entries(models).map(
		([name, fields]) =>
			`defineModel({ name: '${name}', fields: (f) => ({ ${fields.map((field) => `${field}: f.string()`).join(', ')} }) })`,
	)
	await writeFile(
		join(dir, file),
		[
			`import { defineApp, defineModel, memory } from '${kernel}'`,
			`import { fakeState, migrating, recording } from '${fake}'`,
			`export default defineApp({`,
			`	database: ${options.database ?? `migrating(fakeState('${state}'))`},`,
			`	models: [${defined.join(', ')}],`,
			`	logger: recording('${state}'),`,
			`})`,
		].join('\n'),
	)
	return file
}

const migrations = async () =>
	(await readdir(join(dir, 'migrations'))).toSorted()

const read = async (name: string) =>
	readFile(join(dir, 'migrations', name), 'utf8')

describe('the command line', () => {
	it('prints its usage on --help, and on a command it does not know', async () => {
		expect(await run('--help')).toBe(0)
		expect(out[0]).toContain('migrate create <name>')
		expect(await run('deploy')).toBe(1)
		expect(await run('migrate', 'create')).toBe(1)
		expect(await run('migrate', 'deploy', 'now')).toBe(1)
		expect(await run('sync', 'now')).toBe(1)
		expect(await run()).toBe(1)
		expect(err).toHaveLength(5)
	})

	it('writes to the process by default', async () => {
		const write = vi.spyOn(process.stdout, 'write').mockReturnValue(true)
		const writeErr = vi.spyOn(process.stderr, 'write').mockReturnValue(true)
		expect(await main(['--help'])).toBe(0)
		processIo.err('refused')
		expect(write.mock.calls[0]?.[0]).toContain('Usage: ultimabase')
		expect(writeErr).toHaveBeenCalledWith('refused\n')
		expect(processIo.now()).toBeInstanceOf(Date)
		write.mockRestore()
		writeErr.mockRestore()
	})

	it('runs Node and returns its exit code', async () => {
		expect(await processIo.node(['-e', 'process.exitCode = 3'])).toBe(3)
	})

	it('refuses a folder without a config, and a --config that is not there', async () => {
		expect(await run('sync')).toBe(1)
		expect(err[0]).toBe(
			`There is no ultimabase.config.ts in ${dir}: write one that default-exports defineApp(...), or pass --config <path>.`,
		)
		expect(await run('sync', '--config', 'other.ts')).toBe(1)
		expect(err[1]).toBe(`There is no ${join(dir, 'other.ts')}.`)
	})

	it('finds ultimabase.config.ts, and refuses one that is not an application', async () => {
		await writeFile(join(dir, 'ultimabase.config.mjs'), 'export default {}\n')
		expect(await run('sync')).toBe(1)
		expect(err[0]).toBe(
			'ultimabase.config.mjs does not default-export defineApp(...).',
		)
		const empty = join(dir, 'empty.mjs')
		await writeFile(empty, '')
		await expect(load(empty)).rejects.toThrow('does not default-export')
	})

	it('prints the stack of an error that is not a refusal', async () => {
		await writeFile(join(dir, 'broken.mjs'), "throw new Error('broken')\n")
		await writeFile(join(dir, 'odd.mjs'), "throw 'odd'\n")
		expect(await run('sync', '--config', 'broken.mjs')).toBe(1)
		expect(err[0]).toMatch(/^Error: broken\n\s+at /)
		expect(await run('sync', '--config', 'odd.mjs')).toBe(1)
		expect(err[1]).toBe('odd')
	})
})

describe('migrate create', () => {
	it('writes the first migration and the snapshot, then nothing until the models change', async () => {
		const first = await config('create', { Locker: ['label'] })
		expect(await run('migrate', 'create', 'init', '--config', first)).toBe(0)
		const [file, schema] = await migrations()
		expect(file).toMatch(/^20261022123\d{3}_init\.sql$/)
		expect(schema).toBe('schema.json')
		expect(out).toStrictEqual([`Wrote migrations/${file}.`])
		const sql = await read(file ?? '')
		expect(sql).toMatch(
			/^-- ultimabase schema [0-9a-f]{64}\n\ncreate Locker;\n$/,
		)
		expect(JSON.parse(await read('schema.json'))).toStrictEqual({
			models: { Locker: ['label'] },
		})

		expect(await run('migrate', 'create', 'again', '--config', first)).toBe(0)
		expect(out[1]).toBe('The migrations already match the models.')
		expect(await migrations()).toHaveLength(2)

		const second = await config('create', { Locker: ['title'] })
		expect(await run('migrate', 'create', 'rename', '--config', second)).toBe(0)
		const renamed = (await migrations()).find((name) =>
			name.endsWith('_rename.sql'),
		)
		expect((await read(renamed ?? '')).split('\n').slice(2)).toStrictEqual([
			'-- removing "Locker.label" deletes data.',
			'-- a rename? write: rename label to title;',
			'drop Locker.label;',
			'',
			'add Locker.title;',
			'',
		])
	})

	it('writes a file without statements when only names changed', async () => {
		await config(
			'names',
			{ Locker: ['a', 'b'] },
			{ file: 'ultimabase.config.ts' },
		)
		expect(await run('migrate', 'create', 'init')).toBe(0)
		const reordered = await config('names', { Locker: ['b', 'a'] })
		expect(await run('migrate', 'create', 'order', '--config', reordered)).toBe(
			0,
		)
		const file = (await migrations()).find((name) =>
			name.endsWith('_order.sql'),
		)
		expect(await read(file ?? '')).toContain(
			'\n\n-- No statement: only names changed.\n',
		)
	})

	it('refuses a name that is not one, a database without migrations, and SQL files without schema.json', async () => {
		const file = await config('refused', { Locker: ['label'] })
		expect(await run('migrate', 'create', 'Add-Label', '--config', file)).toBe(
			1,
		)
		expect(err[0]).toBe(
			'"Add-Label" is not a migration name: use lowercase letters, digits and _.',
		)
		const empty = await config(
			'refused',
			{ Locker: ['label'] },
			{ database: 'memory()' },
		)
		expect(await run('migrate', 'create', 'init', '--config', empty)).toBe(1)
		expect(err[1]).toBe(
			'This database starts empty every time: it has no tables to migrate.',
		)
		expect(await run('migrate', 'create', 'init', '--config', file)).toBe(0)
		await rm(join(dir, 'migrations', 'schema.json'))
		expect(await run('migrate', 'create', 'next', '--config', file)).toBe(1)
		expect(err[2]).toBe(
			'migrations/ holds SQL files but no schema.json: restore it from version control.',
		)
	})
})

describe('migrate deploy', () => {
	it('applies the pending migrations, once', async () => {
		const state = fakeState('deploy')
		const first = await config('deploy', { Locker: ['label'] })
		await run('migrate', 'create', 'init', '--config', first)
		const second = await config('deploy', { Locker: ['label', 'size'] })
		await run('migrate', 'create', 'size', '--config', second)
		const files = (await migrations()).filter((name) => name.endsWith('.sql'))
		out = []
		expect(await run('migrate', 'deploy', '--config', second)).toBe(0)
		expect(out).toStrictEqual(files.map((name) => `Applied ${name}.`))
		expect(state.stored?.by).toBe('deploy')
		expect(state.stored?.applied.map((given) => given.name)).toStrictEqual(
			files,
		)

		expect(await run('migrate', 'deploy', '--config', second)).toBe(0)
		expect(out[2]).toBe('The database is up to date.')
		expect(state.runs).toHaveLength(1)
	})

	it('stores the snapshot a deploy stopped before storing', async () => {
		const state = fakeState('stopped')
		const file = await config('stopped', { Locker: ['label'] })
		await run('migrate', 'create', 'init', '--config', file)
		const [name = ''] = await migrations()
		const sql = await read(name)
		const { createHash } = await import('node:crypto')
		const checksum = createHash('sha256').update(sql).digest('hex')
		state.stored = {
			snapshot: undefined,
			by: 'deploy',
			applied: [{ name, checksum }],
		}
		expect(await run('migrate', 'deploy', '--config', file)).toBe(0)
		expect(out[1]).toBe('The database is up to date.')
		expect(state.stored.snapshot).toStrictEqual({
			models: { Locker: ['label'] },
		})
	})

	it('refuses no migration, and models that changed since the last one', async () => {
		const first = await config('changed', { Locker: ['label'] })
		expect(await run('migrate', 'deploy', '--config', first)).toBe(1)
		expect(err[0]).toBe(
			'migrations/ holds no migration: run `npx ultimabase migrate create <name>` first.',
		)
		await run('migrate', 'create', 'init', '--config', first)
		const [name] = await migrations()
		const second = await config('changed', { Locker: ['title'] })
		expect(await run('migrate', 'deploy', '--config', second)).toBe(1)
		expect(err[1]).toBe(
			`The models changed after ${name} was written: run \`npx ultimabase migrate create <name>\`, then deploy again.`,
		)
	})

	it('refuses an applied migration that was edited or removed', async () => {
		const file = await config('edited', { Locker: ['label'] })
		await run('migrate', 'create', 'init', '--config', file)
		await run('migrate', 'deploy', '--config', file)
		const [name = ''] = await migrations()
		await writeFile(
			join(dir, 'migrations', name),
			`${await read(name)}-- edited\n`,
		)
		expect(await run('migrate', 'deploy', '--config', file)).toBe(1)
		expect(err[0]).toBe(
			`${name} was edited after it was applied to the database: restore it, and write the change with \`npx ultimabase migrate create <name>\`.`,
		)
		const state = fakeState('edited')
		state.stored = {
			snapshot: state.stored?.snapshot,
			by: 'deploy',
			applied: [{ name: '20260101000000_gone.sql', checksum: 'x' }],
		}
		expect(await run('migrate', 'deploy', '--config', file)).toBe(1)
		expect(err[1]).toBe(
			'20260101000000_gone.sql was applied to the database, and migrations/ no longer holds it: restore it from version control.',
		)
	})

	it('refuses a database that sync built', async () => {
		const file = await config('synced', { Locker: ['label'] })
		expect(await run('sync', '--config', file)).toBe(0)
		await run('migrate', 'create', 'init', '--config', file)
		expect(await run('migrate', 'deploy', '--config', file)).toBe(1)
		expect(err[0]).toBe(
			'`npx ultimabase sync` built this database: deploy applies migrations only to a database they built (D-105).',
		)
	})
})

describe('sync', () => {
	it('syncs the development database, and refuses losing data without --force', async () => {
		const state = fakeState('sync')
		const first = await config('sync', { Locker: ['label'] })
		expect(await run('sync', '--config', first)).toBe(0)
		expect(logs.get('sync')).toContain("Created the database's tables.")
		expect(await run('sync', '--config', first)).toBe(0)
		expect(out).toStrictEqual(['The database already matches the models.'])

		const second = await config('sync', { Locker: ['title'] })
		expect(await run('sync', '--config', second)).toBe(1)
		expect(err[0]).toMatch(
			/^UltimaBase did not sync Locker: removing "Locker.label" deletes data\./,
		)
		expect(await run('sync', '--force', '--config', second)).toBe(0)
		expect(logs.get('sync')).toContain(
			'Synced Locker: removed label, added title.',
		)
		expect(state.runs).toHaveLength(2)
	})

	it('refuses production, and a database without migrations', async () => {
		const file = await config('prod', { Locker: ['label'] })
		process.env['NODE_ENV'] = 'production'
		expect(await run('sync', '--config', file)).toBe(1)
		expect(err[0]).toBe(
			'sync changes only a development database: run `npx ultimabase migrate deploy` in production.',
		)
		process.env['NODE_ENV'] = environment
		const empty = await config(
			'prod',
			{ Locker: ['label'] },
			{ database: 'memory()' },
		)
		expect(await run('sync', '--config', empty)).toBe(1)
		expect(err[1]).toBe(
			'This database starts empty every time: it has no tables to migrate.',
		)
	})
})

describe('start and dev', () => {
	it('starts the application in the process, production by default', async () => {
		const file = await config('start', { Locker: ['label'] })
		delete process.env['NODE_ENV']
		expect(await run('start', '--config', file)).toBe(1)
		expect(process.env['NODE_ENV']).toBe('production')
		expect(err[0]).toContain('run `npx ultimabase migrate deploy`')

		process.env['NODE_ENV'] = 'test'
		expect(await run('start', '--config', file)).toBe(0)
		await (await load(join(dir, file))).app.stop()
	})

	it('runs dev under node --watch, development by default', async () => {
		const file = await config('dev', { Locker: ['label'] })
		delete process.env['NODE_ENV']
		expect(await run('dev', '--config', file)).toBe(7)
		expect(process.env['NODE_ENV']).toBe('development')
		expect(ran).toStrictEqual([['--watch', serveFile, join(dir, file)]])
		expect(existsSync(serveFile)).toBe(true)
	})

	it('serves the application dev watches, or prints why it cannot', async () => {
		const file = await config('serve', { Locker: ['label'] })
		expect(await serve(file, io())).toBe(0)
		await (await load(join(dir, file))).app.stop()
		expect(await serve(undefined, io())).toBe(1)
		expect(err[0]).toContain('There is no ultimabase.config.ts')
	})
})

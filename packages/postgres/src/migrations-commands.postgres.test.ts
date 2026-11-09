// The `ultimabase` commands on PostgreSQL end to end (D-105).
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join as joinPath } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
	eachInSchema,
	inSchema,
	query,
	schema,
	url,
} from './test/migrations.ts'

eachInSchema()

const bin = joinPath(import.meta.dirname, '../../ultimabase/src/cli.ts')
const kernel = pathToFileURL(
	joinPath(import.meta.dirname, '../../ultimabase/src/index.ts'),
).href
const adapterUrl = pathToFileURL(joinPath(import.meta.dirname, 'index.ts')).href

type Ran = { readonly code: number | null; readonly output: string }

/** Runs `ultimabase` in `cwd` until it prints `until` or exits. */
function ultimabase(
	cwd: string,
	args: readonly string[],
	env: Record<string, string>,
	until?: string,
): Promise<Ran> {
	return new Promise((done, fail) => {
		const child = spawn(process.execPath, [bin, ...args], {
			cwd,
			env: { ...process.env, NO_COLOR: '1', ...env },
		})
		let output = ''
		const read = (chunk: Buffer) => {
			output += chunk.toString()
			if (until !== undefined && output.includes(until)) child.kill('SIGTERM')
		}
		child.stdout.on('data', read)
		child.stderr.on('data', read)
		child.on('error', fail)
		child.on('exit', (code) => {
			done({ code, output })
		})
	})
}

const development = () => ({
	DATABASE_URL: inSchema(schema),
	NODE_ENV: 'development',
})

/** What a backfill's update printed, under its file (D-344). */
const updated = (rows: number) =>
	`  update "locker" set "kind" = 'glass' where "label" like 'prod%': UPDATE ${rows}\n`

describe('the commands on postgres()', () => {
	let dir = ''
	let production = ''
	beforeEach(async () => {
		dir = await mkdtemp(joinPath(tmpdir(), 'ultimabase-pg-'))
		production = `t_${randomUUID().replaceAll('-', '')}`
		await query(url, `create schema "${production}"`)
	})
	afterEach(async () => {
		await rm(dir, { recursive: true })
		await query(url, `drop schema "${production}" cascade`)
	})

	/** Writes `ultimabase.config.ts` with a Locker of `fields`. */
	const config = async (fields: string) =>
		writeFile(
			joinPath(dir, 'ultimabase.config.ts'),
			[
				`import { defineApp, defineModel } from '${kernel}'`,
				`import { postgres } from '${adapterUrl}'`,
				`const Locker = defineModel({ name: 'Locker', fields: (f) => ({ ${fields} }) })`,
				`export default defineApp({ database: postgres({ url: process.env.DATABASE_URL ?? '' }), models: [Locker] })`,
			].join('\n'),
		)
	const deployed = () => ({
		DATABASE_URL: inSchema(production),
		NODE_ENV: 'production',
	})

	it('syncs development, refuses what loses data, and writes and deploys migrations', async () => {
		await config('label: f.string()')
		const synced = await ultimabase(dir, ['sync'], development())
		expect(synced).toMatchObject({ code: 0 })
		expect(synced.output).toContain("Created the database's tables.")

		const unready = await ultimabase(dir, ['start'], deployed())
		expect(unready.code).toBe(1)
		expect(unready.output).toBe(
			'The database has no UltimaBase schema: run `npx ultimabase migrate deploy`, then start again.\n',
		)

		expect(
			await ultimabase(dir, ['migrate', 'create', 'init'], {}),
		).toMatchObject({ code: 0 })
		const [init = ''] = (await readdir(joinPath(dir, 'migrations'))).toSorted()
		expect(
			(await readFile(joinPath(dir, 'migrations', init), 'utf8'))
				.split('\n')
				.slice(2),
		).toStrictEqual([
			'create table "locker" (',
			'\t"id" uuid not null,',
			'\t"created_at" timestamptz not null,',
			'\t"updated_at" timestamptz not null,',
			'\t"label" text collate "C" not null,',
			'\tconstraint "locker_pkey" primary key ("id")',
			');',
			'',
		])
		const deploy = await ultimabase(dir, ['migrate', 'deploy'], deployed())
		expect(deploy.code).toBe(0)
		expect(deploy.output).toMatch(/^Applied \d{14}_init\.sql\.\n$/)
		const started = await ultimabase(
			dir,
			['start'],
			deployed(),
			'Application stopped.',
		)
		expect(started.output).toContain('Application started.')

		await config('size: f.number({ optional: true })')
		const stale = await ultimabase(dir, ['migrate', 'deploy'], deployed())
		expect(stale.code).toBe(1)
		expect(stale.output).toContain('The models changed after')
		const behind = await ultimabase(dir, ['start'], deployed())
		expect(behind.output).toBe(
			"The database's tables are not the models': run `npx ultimabase migrate deploy`, then start again.\n",
		)
		const refused = await ultimabase(dir, ['sync'], development())
		expect(refused.code).toBe(1)
		expect(refused.output).toBe(
			[
				'UltimaBase did not sync Locker: removing "Locker.label" deletes data.',
				'  alter table "locker" drop column "label";',
				'Run `npx ultimabase sync --force` to apply it to this development database,',
				'or `npx ultimabase migrate create <name>` to write it as a migration.',
				'',
			].join('\n'),
		)

		expect(
			await ultimabase(dir, ['migrate', 'create', 'size'], {}),
		).toMatchObject({ code: 0 })
		const files = (await readdir(joinPath(dir, 'migrations'))).toSorted()
		const size = files.find((name) => name.endsWith('_size.sql')) ?? ''
		expect(
			(await readFile(joinPath(dir, 'migrations', size), 'utf8'))
				.split('\n')
				.slice(2),
		).toStrictEqual([
			'-- removing "Locker.label" deletes data.',
			'alter table "locker" drop column "label";',
			'',
			'alter table "locker" add column "size" double precision;',
			'',
		])
		const next = await ultimabase(dir, ['migrate', 'deploy'], deployed())
		expect(next.output).toBe(`Applied ${size}.\n`)
		const synced2 = await ultimabase(dir, ['migrate', 'deploy'], development())
		expect(synced2.output).toContain(
			'Development sync changed this database since its last deploy',
		)
	}, 60_000)

	it('fills the rows with a fixed default, in a sync and in a migration', async () => {
		await config('label: f.string()')
		await ultimabase(dir, ['sync'], development())
		await ultimabase(dir, ['migrate', 'create', 'init'], {})
		await query(
			inSchema(schema),
			`insert into locker values (gen_random_uuid(), now(), now(), 'a')`,
		)
		await config('label: f.string(), done: f.boolean({ default: false })')
		const synced = await ultimabase(dir, ['sync'], development())
		expect(synced.code).toBe(0)
		expect(synced.output).toContain(
			'Synced Locker: added done, false in the rows it held.',
		)
		expect(
			await query(inSchema(schema), 'select label, done from locker'),
		).toStrictEqual([{ label: 'a', done: false }])

		await ultimabase(dir, ['migrate', 'create', 'done'], {})
		const files = await readdir(joinPath(dir, 'migrations'))
		const done = files.find((name) => name.endsWith('_done.sql')) ?? ''
		expect(
			(await readFile(joinPath(dir, 'migrations', done), 'utf8'))
				.split('\n')
				.slice(2),
		).toStrictEqual([
			'alter table "locker" add column "done" boolean not null default false;',
			'',
		])

		await config(
			"label: f.string(), done: f.boolean({ default: false }), tags: f.string({ list: true }), kept: f.string({ list: true, default: ['a'] }), sized: f.string({ list: true, size: { min: 1 } }), kinds: f.string({ list: true, default: ['a'], size: { min: 1 } })",
		)
		await ultimabase(dir, ['migrate', 'create', 'lists'], {})
		const named = await readdir(joinPath(dir, 'migrations'))
		const lists = named.find((name) => name.endsWith('_lists.sql')) ?? ''
		expect(
			(await readFile(joinPath(dir, 'migrations', lists), 'utf8'))
				.split('\n')
				.slice(2),
		).toStrictEqual([
			`alter table "locker" add column "tags" text[] not null default '{}'::text[];`,
			'-- The stored rows hold an empty "Locker.tags": fill them here if the model needs a value.',
			'',
			`alter table "locker" add column "kept" text[] not null default '{"a"}'::text[];`,
			'',
			`alter table "locker" add column "sized" text[] not null default '{}'::text[];`,
			'-- The stored rows hold an empty "Locker.sized": fill them here if the model needs a value.',
			'',
			`alter table "locker" add column "kinds" text[] not null default '{"a"}'::text[];`,
			'',
			'-- bounding the size of "Locker.sized" fails when a row holds another number of values.',
			'alter table "locker" add constraint "locker_sized_size_check" check (cardinality("sized") >= 1);',
			'-- Code still running without "Locker.sized" inserts it empty, which this refuses: with a rolling deploy, bound its size in a later deploy.',
			'',
			'-- bounding the size of "Locker.kinds" fails when a row holds another number of values.',
			'alter table "locker" add constraint "locker_kinds_size_check" check (cardinality("kinds") >= 1);',
			'',
		])
	}, 30_000)

	it('refuses a reset of a database on another machine without --force', async () => {
		await config('label: f.string()')
		const refused = await ultimabase(dir, ['reset'], {
			...development(),
			DATABASE_URL: 'postgres://u@db.example.com/app',
		})
		expect(refused).toStrictEqual({
			code: 1,
			output:
				'reset drops every table, and db.example.com is not this machine: pass --force if it holds a development database.\n',
		})
	})

	it('tests a data migration on a copy of production, then deploys it', async () => {
		await config('label: f.string()')
		await ultimabase(dir, ['migrate', 'create', 'init'], {})
		const [init = ''] = (await readdir(joinPath(dir, 'migrations'))).toSorted()
		const row = `insert into locker (id, created_at, updated_at, label) values (gen_random_uuid(), now(), now(), 'prod row')`
		await ultimabase(dir, ['migrate', 'deploy'], deployed())
		await query(inSchema(production), row)
		// The development schema stands for a restored dump of production.
		await ultimabase(dir, ['migrate', 'deploy'], development())
		await query(inSchema(schema), row)

		await config("label: f.string(), kind: f.enumOf(['wood', 'glass'])")
		const tried = await ultimabase(dir, ['sync'], development())
		expect(tried).toStrictEqual({
			code: 1,
			output: [
				'UltimaBase did not sync Locker: adding the required "Locker.kind" fails when Locker holds rows: make it optional, or give it a value as its default, not a function.',
				'  alter table "locker" add column "kind" text collate "C" not null;',
				'  -- column "kind" of relation "locker" contains null values',
				'Fix those rows in this development database, or rebuild it from the migrations with `npx ultimabase reset`.',
				'In production, a migration fixes them: write it with `npx ultimabase migrate create <name>`.',
				'',
			].join('\n'),
		})

		await ultimabase(dir, ['migrate', 'create', 'add_kind'], {})
		const files = (await readdir(joinPath(dir, 'migrations'))).toSorted()
		const kind = files.find((name) => name.endsWith('_add_kind.sql')) ?? ''
		const path = joinPath(dir, 'migrations', kind)
		const [header = '', ...generated] = (await readFile(path, 'utf8')).split(
			'\n',
		)
		expect(generated.slice(1)).toStrictEqual([
			'-- adding the required "Locker.kind" fails when Locker holds rows: make it optional, or give it a value as its default, not a function.',
			'alter table "locker" add column "kind" text collate "C" not null;',
			'-- Code still running without "Locker.kind" fails to insert once this runs: with a rolling deploy, make it required in a later deploy.',
			'',
			'-- limiting "Locker.kind" to wood, glass fails when a row holds another value.',
			`alter table "locker" add constraint "locker_kind_check" check ("kind" in ('wood', 'glass'));`,
			'',
		])
		expect(
			await ultimabase(dir, ['migrate', 'status'], development()),
		).toStrictEqual({ code: 1, output: `${kind} is pending.\n` })
		expect(
			await ultimabase(dir, ['migrate', 'deploy'], development()),
		).toStrictEqual({
			code: 1,
			output: `${kind} was not applied: column "kind" of relation "locker" contains null values\nThe database rolled it back: fix it, then deploy again.\n`,
		})

		await writeFile(
			path,
			[
				header,
				'alter table "locker" add column "kind" text collate "C";',
				`update "locker" set "kind" = 'glass' where "label" like 'prod%';`,
				'alter table "locker" alter column "kind" set not null;',
				`alter table "locker" add constraint "locker_kind_check" check ("kind" in ('wood', 'glass'));`,
				'',
			].join('\n'),
		)
		expect(
			await ultimabase(dir, ['migrate', 'deploy'], development()),
		).toStrictEqual({ code: 0, output: `Applied ${kind}.\n${updated(1)}` })
		expect(
			await ultimabase(dir, ['migrate', 'status'], development()),
		).toStrictEqual({ code: 0, output: 'The database is up to date.\n' })
		const migrated = [{ label: 'prod row', kind: 'glass' }]
		expect(
			await query(inSchema(schema), 'select label, kind from locker'),
		).toStrictEqual(migrated)

		expect(
			await ultimabase(dir, ['migrate', 'deploy'], deployed()),
		).toStrictEqual({ code: 0, output: `Applied ${kind}.\n${updated(1)}` })
		expect(
			await query(inSchema(production), 'select label, kind from locker'),
		).toStrictEqual(migrated)

		expect(await ultimabase(dir, ['reset'], development())).toStrictEqual({
			code: 0,
			output: `Dropped locker.\nApplied ${init}.\nApplied ${kind}.\n${updated(0)}`,
		})
		expect(
			await query(inSchema(schema), 'select label from locker'),
		).toStrictEqual([])
	}, 60_000)
})

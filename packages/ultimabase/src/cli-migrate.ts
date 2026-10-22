// `migrate create` and `sync` (D-105), and the migration files both
// `migrate` commands read.
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Migration, Statement } from './adapter.ts'
import type { Internals } from './app-internals.ts'
import { kernelLogger, schemaOf } from './lifecycle.ts'
import { hashOf, migrationsOf, Refused, synced } from './migrate.ts'

export const header = '-- ultimabase schema '
export const create = '`npx ultimabase migrate create <name>`'

export type Folder = {
	readonly files: readonly Migration[]
	readonly snapshot: unknown
}

/** The `.sql` files of `dir` in name order, and its `schema.json`. */
export async function read(dir: string): Promise<Folder> {
	if (!existsSync(dir)) return { files: [], snapshot: undefined }
	const names = (await readdir(dir))
		.filter((name) => name.endsWith('.sql'))
		.toSorted()
	const files = await Promise.all(
		names.map(async (name) => {
			const sql = await readFile(join(dir, name), 'utf8')
			const checksum = createHash('sha256').update(sql).digest('hex')
			return { name, sql, checksum }
		}),
	)
	const json = join(dir, 'schema.json')
	if (!existsSync(json)) {
		if (files.length > 0) {
			throw new Refused(
				'migrations/ holds SQL files but no schema.json: restore it from version control.',
			)
		}
		return { files, snapshot: undefined }
	}
	const snapshot: unknown = JSON.parse(await readFile(json, 'utf8'))
	return { files, snapshot }
}

/** `yyyyMMddHHmmss`, in UTC. */
const stamp = (now: Date): string =>
	now.toISOString().replaceAll(/[-:T]/g, '').slice(0, 'yyyyMMddHHmmss'.length)

function body(
	hash: string,
	statements: readonly Statement[],
	none: string,
): string {
	const blocks = statements.map(({ sql, loses, tries, rename }) =>
		[
			...(loses === undefined ? [] : [`-- ${loses}.`]),
			...(tries === undefined ? [] : [`-- ${tries}.`]),
			...(rename === undefined ? [] : [`-- a rename? write: ${rename.sql};`]),
			`${sql};`,
		].join('\n'),
	)
	const parts = blocks.length > 0 ? blocks : [none]
	return `${header}${hash}\n\n${parts.join('\n\n')}\n`
}

/**
 * Writes the migration from `schema.json` to the models; with no model
 * changed, a file for the developer's SQL, as a data migration.
 */
export async function migrateCreate(
	{ options }: Internals,
	dir: string,
	name: string,
	now: Date,
): Promise<string> {
	if (!/^[a-z0-9_]+$/.test(name)) {
		throw new Refused(
			`"${name}" is not a migration name: use lowercase letters, digits and _.`,
		)
	}
	const migrations = migrationsOf(options.database)
	const to = migrations.snapshot(schemaOf(options))
	const { snapshot: from } = await read(dir)
	const hash = hashOf(to)
	const file = `${stamp(now)}_${name}.sql`
	await mkdir(dir, { recursive: true })
	if (from !== undefined && hashOf(from) === hash) {
		const sql = body(hash, [], '-- No model changed: write your SQL here.')
		await writeFile(join(dir, file), sql, { flag: 'wx' })
		return `Wrote migrations/${file}: no model changed, write your SQL in it.`
	}
	const statements = migrations.plan(from, to)
	const sql = body(hash, statements, '-- No statement: only names changed.')
	await writeFile(join(dir, file), sql, { flag: 'wx' })
	await writeFile(
		join(dir, 'schema.json'),
		`${JSON.stringify(to, null, '\t')}\n`,
	)
	return `Wrote migrations/${file}.`
}

/** Syncs a development database, losing data only with `force`. */
export async function sync(
	{ options }: Internals,
	force: boolean,
): Promise<string | undefined> {
	if (process.env['NODE_ENV'] === 'production') {
		throw new Refused(
			'sync changes only a development database: run `npx ultimabase migrate deploy` in production.',
		)
	}
	const { database } = options
	migrationsOf(database)
	const schema = schemaOf(options)
	await database.start(schema)
	try {
		const ran = await synced(database, schema, kernelLogger(options), force)
		return ran === undefined
			? 'The database already matches the models.'
			: undefined
	} finally {
		await database.stop()
	}
}

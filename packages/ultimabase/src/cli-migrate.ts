// `migrate create`, `migrate deploy` and `sync` (D-105).
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Migration, Statement } from './adapter.ts'
import type { Internals } from './app-internals.ts'
import { kernelLogger, schemaOf } from './lifecycle.ts'
import { hashOf, migrationsOf, Refused, synced } from './migrate.ts'

const header = '-- ultimabase schema '
const create = '`npx ultimabase migrate create <name>`'

type Folder = {
	readonly files: readonly Migration[]
	readonly snapshot: unknown
}

/** The `.sql` files of `dir` in name order, and its `schema.json`. */
async function read(dir: string): Promise<Folder> {
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

function body(hash: string, statements: readonly Statement[]): string {
	const blocks = statements.map(({ sql, loses, rename }) =>
		[
			...(loses === undefined ? [] : [`-- ${loses}.`]),
			...(rename === undefined ? [] : [`-- a rename? write: ${rename.sql};`]),
			`${sql};`,
		].join('\n'),
	)
	const parts =
		blocks.length > 0 ? blocks : ['-- No statement: only names changed.']
	return `${header}${hash}\n\n${parts.join('\n\n')}\n`
}

/** Writes the migration from `schema.json` to the models, if they differ. */
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
	if (from !== undefined && hashOf(from) === hash) {
		return 'The migrations already match the models.'
	}
	const file = `${stamp(now)}_${name}.sql`
	await mkdir(dir, { recursive: true })
	const sql = body(hash, migrations.plan(from, to))
	await writeFile(join(dir, file), sql, { flag: 'wx' })
	await writeFile(
		join(dir, 'schema.json'),
		`${JSON.stringify(to, null, '\t')}\n`,
	)
	return `Wrote migrations/${file}.`
}

/** Refuses an applied file that was edited or removed since. */
function checkApplied(
	applied: readonly { readonly name: string; readonly checksum: string }[],
	files: readonly Migration[],
): void {
	for (const { name, checksum } of applied) {
		const file = files.find((given) => given.name === name)
		if (file === undefined) {
			throw new Refused(
				`${name} was applied to the database, and migrations/ no longer holds it: restore it from version control.`,
			)
		}
		if (file.checksum !== checksum) {
			throw new Refused(
				`${name} was edited after it was applied to the database: restore it, and write the change with ${create}.`,
			)
		}
	}
}

/** Applies the pending migrations, then stores the models' snapshot. */
export async function migrateDeploy(
	{ options }: Internals,
	dir: string,
): Promise<readonly string[]> {
	const { database } = options
	const migrations = migrationsOf(database)
	const schema = schemaOf(options)
	const to = migrations.snapshot(schema)
	const { files } = await read(dir)
	const last = files.at(-1)
	if (last === undefined) {
		throw new Refused(`migrations/ holds no migration: run ${create} first.`)
	}
	if (!last.sql.startsWith(`${header}${hashOf(to)}\n`)) {
		throw new Refused(
			`The models changed after ${last.name} was written: run ${create}, then deploy again.`,
		)
	}
	await database.start(schema)
	try {
		const stored = await migrations.stored()
		if (stored?.by === 'sync') {
			throw new Refused(
				'`npx ultimabase sync` built this database: deploy applies migrations only to a database they built (D-105).',
			)
		}
		const applied = stored?.applied ?? []
		checkApplied(applied, files)
		const pending = files.filter(
			(file) => !applied.some((given) => given.name === file.name),
		)
		const current =
			stored?.snapshot !== undefined && hashOf(stored.snapshot) === hashOf(to)
		if (pending.length === 0 && current) return ['The database is up to date.']
		await migrations.apply({ kind: 'deploy', files: pending, to })
		return pending.length === 0
			? ['The database is up to date.']
			: pending.map((file) => `Applied ${file.name}.`)
	} finally {
		await database.stop()
	}
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

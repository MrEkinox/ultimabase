// `migrate deploy`, `migrate status` and `reset` (D-105): the migration
// files against those the database applied.
import type { Migration, Migrations, Stored } from './adapter.ts'
import { MigrationFailed } from './adapter.ts'
import type { Internals } from './app-internals.ts'
import { create, header, read } from './cli-migrate.ts'
import { schemaOf } from './lifecycle.ts'
import { hashOf, migrationsOf, Refused } from './migrate.ts'

const upToDate = 'The database is up to date.'

const production = (): boolean => process.env['NODE_ENV'] === 'production'

/** The files the database has not applied; refuses one edited or removed. */
function pendingOf(
	stored: Stored | undefined,
	files: readonly Migration[],
): readonly Migration[] {
	const applied = stored?.applied ?? []
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
	return files.filter(
		(file) => !applied.some((given) => given.name === file.name),
	)
}

/** Why the files do not lead to the models whose hash is `hash`, if so. */
function behind(files: readonly Migration[], hash: string): string | undefined {
	const last = files.at(-1)
	if (last === undefined) {
		return `migrations/ holds no migration: run ${create} first.`
	}
	if (last.sql.startsWith(`${header}${hash}\n`)) return undefined
	return `The models changed after ${last.name} was written: run ${create}, then deploy again.`
}

function syncedSince(): string {
	return [
		'Development sync changed this database since its last deploy: deploy applies migrations only to a database they built (D-105).',
		...(production()
			? []
			: [
					'Restore the dump you test on, or rebuild this database from the migrations with `npx ultimabase reset`.',
				]),
	].join('\n')
}

/** Applies `files`; a refused one names those applied before it. */
async function deployed(
	migrations: Migrations,
	files: readonly Migration[],
	to: unknown,
	again: string,
): Promise<readonly string[]> {
	const lines = files.map((file) => `Applied ${file.name}.`)
	try {
		await migrations.apply({ kind: 'deploy', files, to })
	} catch (error) {
		if (!(error instanceof MigrationFailed)) throw error
		const done = files.findIndex((file) => file.name === error.at)
		throw new Refused(
			[
				...lines.slice(0, done),
				`${error.at} was not applied: ${error.reason}`,
				`The database rolled it back: fix it, then ${again}.`,
			].join('\n'),
		)
	}
	return lines
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
	const hash = hashOf(to)
	const { files } = await read(dir)
	const refused = behind(files, hash)
	if (refused !== undefined) throw new Refused(refused)
	await database.start(schema)
	try {
		const stored = await migrations.stored()
		if (stored?.by === 'sync') throw new Refused(syncedSince())
		const pending = pendingOf(stored, files)
		const current =
			stored?.snapshot !== undefined && hashOf(stored.snapshot) === hash
		if (pending.length === 0 && current) return [upToDate]
		const lines = await deployed(migrations, pending, to, 'deploy again')
		return lines.length === 0 ? [upToDate] : lines
	} finally {
		await database.stop()
	}
}

/** What a deploy would do or refuse; `ok` when it has nothing to do. */
export async function migrateStatus(
	{ options }: Internals,
	dir: string,
): Promise<{ readonly lines: readonly string[]; readonly ok: boolean }> {
	const { database } = options
	const migrations = migrationsOf(database)
	const schema = schemaOf(options)
	const hash = hashOf(migrations.snapshot(schema))
	const { files } = await read(dir)
	await database.start(schema)
	try {
		const stored = await migrations.stored()
		const late = behind(files, hash)
		const lines = [
			...(late === undefined ? [] : [late]),
			...(stored?.by === 'sync' ? [syncedSince()] : []),
			...pendingOf(stored, files).map((file) => `${file.name} is pending.`),
		]
		if (lines.length > 0) return { lines, ok: false }
		if (stored?.snapshot !== undefined && hashOf(stored.snapshot) === hash) {
			return { lines: [upToDate], ok: true }
		}
		return {
			lines: [
				"The database's snapshot is not the models': run `npx ultimabase migrate deploy`.",
			],
			ok: false,
		}
	} finally {
		await database.stop()
	}
}

/** Drops a development database's tables, then applies every migration. */
export async function reset(
	{ options }: Internals,
	dir: string,
): Promise<readonly string[]> {
	if (production()) {
		throw new Refused(
			'reset rebuilds only a development database: it is refused in production.',
		)
	}
	const { database } = options
	const migrations = migrationsOf(database)
	const schema = schemaOf(options)
	const { files, snapshot } = await read(dir)
	await database.start(schema)
	try {
		const dropped = await migrations.reset()
		const lines = [
			dropped.length === 0
				? 'The database held no table.'
				: `Dropped ${dropped.join(', ')}.`,
		]
		const last = files.at(-1)
		if (last === undefined) {
			return [
				...lines,
				'migrations/ holds no migration: the next start builds the tables.',
			]
		}
		lines.push(...(await deployed(migrations, files, snapshot, 'reset again')))
		if (behind(files, hashOf(migrations.snapshot(schema))) !== undefined) {
			lines.push(
				`The models changed after ${last.name} was written: the next start syncs them.`,
			)
		}
		return lines
	} finally {
		await database.stop()
	}
}

// `migrate deploy`, `migrate status` and `reset` (D-105): the migration
// files against those the database applied.
import type { Migration, Migrations, Stored } from './adapter.ts'
import { MigrationFailed } from './adapter.ts'
import type { Internals } from './app-internals.ts'
import { create, read } from './cli-migrate.ts'
import { kernelLogger, schemaOf } from './lifecycle.ts'
import { Refused } from './errors.ts'
import { ahead, hashOf, held, migrationsOf } from './migrate.ts'

const upToDate = 'The database is up to date.'

const production = (): boolean => process.env['NODE_ENV'] === 'production'

/** How a development database gets back to what the files build. */
const rebuild = (): readonly string[] =>
	production()
		? []
		: [
				'Restore the dump you test on, or rebuild this database from the migrations with `npx ultimabase reset`.',
			]

const refused = (...lines: readonly string[]): Refused =>
	new Refused([...lines, ...rebuild()].join('\n'))

/**
 * The files the database has not applied, and the files it applied after
 * the last one, which newer code wrote; refuses a file edited or removed.
 */
function planOf(
	stored: Stored | undefined,
	files: readonly Migration[],
): { readonly pending: readonly Migration[]; readonly later: string[] } {
	const applied = stored?.applied ?? []
	const last = files.at(-1)?.name ?? ''
	const later: string[] = []
	for (const { name, checksum } of applied) {
		const file = files.find((given) => given.name === name)
		if (file === undefined && name > last) {
			later.push(name)
		} else if (file === undefined) {
			throw refused(
				`${name} was applied to the database, and migrations/ no longer holds it: restore it from version control.`,
			)
		} else if (file.checksum !== checksum) {
			throw refused(
				`${name} was edited after it was applied to the database: restore it, and write the change with ${create}.`,
			)
		}
	}
	const pending = files.filter(
		(file) => !applied.some((given) => given.name === file.name),
	)
	const [first] = pending
	if (first !== undefined && later.length > 0) {
		throw refused(
			`${first.name} is pending, and the database applied ${later.join(', ')} after it, which migrations/ does not hold: deploy the code that holds them.`,
		)
	}
	return { pending, later }
}

/** Why the files do not lead to the models whose hash is `hash`, if so. */
function behind(files: readonly Migration[], hash: string): string | undefined {
	const last = files.at(-1)
	if (last === undefined) {
		return `migrations/ holds no migration: run ${create} first.`
	}
	if (last.schema === hash) return undefined
	return `The models changed after ${last.name} was written: run ${create}, then deploy again.`
}

const syncedSince = (): Refused =>
	refused(
		'Development sync changed this database since its last deploy: deploy applies migrations only to a database they built.',
	)

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
				files[done]?.transaction === false
					? `It ran without a transaction, so nothing was rolled back: undo what it left, such as an invalid index, then ${again}.`
					: `The database rolled it back: fix it, then ${again}.`,
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
	const late = behind(files, hash)
	if (late !== undefined) throw new Refused(late)
	await database.start(schema, kernelLogger(options))
	try {
		const stored = await migrations.stored()
		if (stored?.by === 'sync') throw syncedSince()
		const { pending, later } = planOf(stored, files)
		// The code was rolled back: its migrations are applied, and more.
		if (later.length > 0) return [ahead(later)]
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
	await database.start(schema, kernelLogger(options))
	try {
		const stored = await migrations.stored()
		const late = behind(files, hash)
		const { pending, later } = planOf(stored, files)
		const lines = [
			...(late === undefined ? [] : [late]),
			...(stored?.by === 'sync' ? [syncedSince().message] : []),
			...pending.map((file) => `${file.name} is pending.`),
		]
		if (lines.length > 0) return { lines, ok: false }
		if (later.length > 0) return { lines: [ahead(later)], ok: true }
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

/** Drops every table; one another session holds stops the reset. */
async function dropAll(migrations: Migrations): Promise<readonly string[]> {
	try {
		return await migrations.reset()
	} catch (error) {
		if (!(error instanceof MigrationFailed && error.locked)) throw error
		throw new Refused(
			[
				'UltimaBase did not reset the database: another session held a table.',
				`  ${error.at};`,
				`  -- ${error.reason}`,
				held,
			].join('\n'),
		)
	}
}

/**
 * Drops a development database's tables, then applies every migration; one
 * on another machine only with `force`.
 */
export async function reset(
	{ options }: Internals,
	dir: string,
	force: boolean,
): Promise<readonly string[]> {
	if (production()) {
		throw new Refused(
			'reset rebuilds only a development database: it is refused in production.',
		)
	}
	const { database } = options
	const migrations = migrationsOf(database)
	if (migrations.remote !== undefined && !force) {
		throw new Refused(
			`reset drops every table, and ${migrations.remote} is not this machine: pass --force if it holds a development database.`,
		)
	}
	const schema = schemaOf(options)
	const { files, snapshot } = await read(dir)
	await database.start(schema, kernelLogger(options))
	try {
		const dropped = await dropAll(migrations)
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

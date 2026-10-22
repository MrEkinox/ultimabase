// Development sync and the production check (D-105): the models' snapshot
// against the database's, through the adapter's `migrations`.
import { createHash } from 'node:crypto'
import type { Adapter, Migrations, Schema, Statement } from './adapter.ts'
import { MigrationFailed } from './adapter.ts'
import type { Logger } from './app-options.ts'

/** A refusal whose message says it all: the commands print no stack. */
export class Refused extends Error {
	constructor(message: string) {
		super(message)
		this.name = 'Refused'
	}
}

/** The value with its keys sorted, so equal snapshots serialize alike. */
function canonical(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(canonical)
	if (typeof value !== 'object' || value === null) return value
	const keys = Object.keys(value).toSorted()
	return Object.fromEntries(
		keys.map((key) => [key, canonical(Reflect.get(value, key))]),
	)
}

/** The SHA-256 of a snapshot's canonical JSON. */
export function hashOf(snapshot: unknown): string {
	return createHash('sha256')
		.update(JSON.stringify(canonical(snapshot)))
		.digest('hex')
}

/** The database's `migrations`, or a refusal naming what has none. */
export function migrationsOf(database: Adapter): Migrations {
	if (database.migrations === undefined) {
		throw new Refused(
			'This database starts empty every time: it has no tables to migrate.',
		)
	}
	return database.migrations
}

function refusal(losing: readonly Statement[]): string {
	const models = [...new Set(losing.map((statement) => statement.model))]
	const why = losing.map((statement) => statement.loses).join('; ')
	return [
		`UltimaBase did not sync ${models.join(', ')}: ${why}.`,
		...losing.flatMap(({ sql, rename }) => [
			...(rename === undefined
				? []
				: [
						`  -- a rename? keep its data: give ${rename.to} dbName: '${rename.dbName}'.`,
					]),
			`  ${sql};`,
		]),
		'Run `npx ultimabase sync --force` to apply it to this development database,',
		'or `npx ultimabase migrate create <name>` to write it as a migration.',
	].join('\n')
}

/** Why a tried statement failed, and how to fix the rows. */
function failure(
	statements: readonly Statement[],
	{ at, reason }: MigrationFailed,
): string {
	const statement = statements.find((given) => given.sql === at)
	const model = statement?.model ?? 'the models'
	return [
		`UltimaBase did not sync ${model}: ${statement?.tries ?? 'the database refused it'}.`,
		`  ${at};`,
		`  -- ${reason}`,
		'Fix those rows in this development database, or rebuild it from the migrations with `npx ultimabase reset`.',
		'In production, a migration fixes them: write it with `npx ultimabase migrate create <name>`.',
	].join('\n')
}

/**
 * Brings a development database to the models, refusing what loses data
 * unless `force`, and logs what changed. Returns the statements it ran, or
 * none when the database already matched.
 */
export async function synced(
	database: Adapter,
	schema: Schema,
	logger: Logger,
	force: boolean,
): Promise<readonly Statement[] | undefined> {
	const migrations = database.migrations
	if (migrations === undefined) return undefined
	const stored = await migrations.stored()
	const from = stored?.snapshot
	const to = migrations.snapshot(schema)
	if (from !== undefined && hashOf(from) === hashOf(to)) return undefined
	const statements = migrations.plan(from, to)
	const losing = statements.filter((statement) => statement.loses !== undefined)
	if (losing.length > 0 && !force) throw new Refused(refusal(losing))
	try {
		await migrations.apply({ kind: 'sync', from, statements, to })
	} catch (error) {
		if (error instanceof MigrationFailed) {
			throw new Refused(failure(statements, error))
		}
		throw error
	}
	if (from === undefined) {
		logger.info("Created the database's tables.")
		return statements
	}
	if (statements.length === 0) {
		logger.info("Synced the models' names: no table changed.")
	}
	const changes = Map.groupBy(statements, (statement) => statement.model)
	for (const [model, made] of changes) {
		const does = made.map((statement) => statement.does).join(', ')
		logger.info(`Synced ${model}: ${does}.`)
	}
	return statements
}

/** Refuses a production database whose snapshot is not the models'. */
export async function checked(
	database: Adapter,
	schema: Schema,
): Promise<void> {
	const migrations = database.migrations
	if (migrations === undefined) return
	const stored = await migrations.stored()
	const deploy = 'run `npx ultimabase migrate deploy`, then start again.'
	if (stored?.snapshot === undefined) {
		throw new Refused(`The database has no UltimaBase schema: ${deploy}`)
	}
	if (hashOf(stored.snapshot) !== hashOf(migrations.snapshot(schema))) {
		throw new Refused(
			`The database's tables are not the models' (D-105): ${deploy}`,
		)
	}
}

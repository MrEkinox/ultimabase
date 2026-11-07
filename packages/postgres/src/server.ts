// What a start asks the server first, and what it refuses (D-50, D-140,
// D-148).
import type { Kysely } from 'kysely'
import { sql } from 'kysely'
import type { Logger } from 'ultimabase'
import { Refused } from 'ultimabase'
import type { Catalog } from './names.ts'

/** Refuses a server below PostgreSQL 15 (D-50). */
export function requireVersion(version: string | undefined): void {
	if (!(Number(version) >= 150000)) {
		throw new Refused(`UltimaBase needs PostgreSQL 15 or later.`)
	}
}

/** What a case-insensitive filter misses when `lower('É') <> 'é'` (D-140). */
export function foldWarning(ctype: string): string {
	return `PostgreSQL folds case under its ${ctype} locale for ASCII only: a case-insensitive filter matches É and é in memory() but not here. Create the database with a UTF-8 locale, such as en_US.UTF-8.`
}

/**
 * Refuses a server UltimaBase cannot run on, warns of one that folds case
 * for ASCII only, and answers the schema the connections found.
 */
export async function schemaOf(
	db: Kysely<object>,
	catalog: Catalog,
	logger: Logger,
): Promise<string | undefined> {
	const { rows } = await sql<{
		version: string
		folds: boolean
		ctype: string
		language: boolean
		schema: string
	}>`select current_setting('server_version_num') as version, current_schema() as schema,
		lower('É') = 'é' as folds,
		(select datctype from pg_database where datname = current_database()) as ctype,
		exists (select from pg_ts_config as c join pg_namespace as n on n.oid = c.cfgnamespace where (c.cfgname = ${catalog.language} and pg_ts_config_is_visible(c.oid)) or n.nspname || '.' || c.cfgname = ${catalog.language}) as language`.execute(
		db,
	)
	const [server] = rows
	requireVersion(server?.version)
	if (server?.language === false) {
		throw new Refused(
			`postgres() searches in '${catalog.language}', a text search configuration this server does not have.`,
		)
	}
	if (server !== undefined && !server.folds) {
		logger.warn(foldWarning(server.ctype))
	}
	return server?.schema
}

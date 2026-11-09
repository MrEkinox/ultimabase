// How a storage adapter follows the models (D-105), in the adapter
// contract (D-73).
import type { Schema } from './adapter.ts'

/** One statement of a plan, as it runs and as a migration file shows it. */
export type Statement = {
	readonly sql: string
	/** The model it changes, and how, for the log: `Locker`, `added owner`. */
	readonly model: string
	readonly does: string
	/** What it deletes, when it loses data: `removing "Locker.label" deletes data`. */
	readonly loses?: string
	/**
	 * When the database refuses it, for a change rows can break:
	 * `limiting "Locker.kind" to wood, glass fails when a row holds another value`.
	 */
	readonly tries?: string
	/**
	 * What the author of a migration file may have to do after it, which the
	 * file shows below it: `The stored rows hold an empty "Account.languages":
	 * fill them here if the model needs a value`.
	 */
	readonly note?: string
	/**
	 * A removal that may be a rename: the name it keeps its data under with
	 * `dbName` (`label`), and each field or model that may be the same
	 * (`Locker.title`), with the statements that rename to it (D-232, D-251).
	 */
	readonly rename?: {
		readonly dbName: string
		readonly to: readonly {
			readonly name: string
			readonly sql: readonly string[]
		}[]
	}
}

/** A migration file: its file name, its SQL and its SHA-256. */
export type Migration = {
	readonly name: string
	readonly sql: string
	readonly checksum: string
	/** The models' hash its header names, which a production start reads. */
	readonly schema?: string
	/** False when its second line is `-- ultimabase no transaction`. */
	readonly transaction: boolean
}

/** The snapshot a database's tables match, and who wrote it (D-105). */
export type Stored = {
	/** None when a deploy stopped before it stored one. */
	readonly snapshot: unknown
	readonly by: 'sync' | 'deploy'
	/** In name order. */
	readonly applied: readonly {
		readonly name: string
		readonly checksum: string
		readonly schema?: string
	}[]
}

/**
 * Development sync's statements, or the migration files to deploy, each in
 * its transaction; then `to` is stored.
 */
export type Run =
	| {
			readonly kind: 'sync'
			/** The snapshot the statements start from, checked under the lock. */
			readonly from: unknown
			readonly statements: readonly Statement[]
			readonly to: unknown
	  }
	| {
			readonly kind: 'deploy'
			readonly files: readonly Migration[]
			/**
			 * Every file name the code holds: the deploy is refused, under the
			 * lock, when the database applied another (D-347).
			 */
			readonly known: readonly string[]
			readonly to: unknown
	  }

/**
 * A statement of a deployed file that inserted, updated, deleted or merged
 * rows, and how many, zero included (D-344).
 */
export type Counted = {
	/** The file's name. */
	readonly at: string
	/** The statement as the file wrote it, without its semicolon. */
	readonly statement: string
	/** `INSERT`, `UPDATE`, `DELETE` or `MERGE`. */
	readonly command: string
	readonly rows: number
}

/**
 * How a database follows the models (D-105). A snapshot is JSON in the
 * adapter's own format, which it validates when it reads one back.
 */
export interface Migrations {
	/** What this database makes of the models. */
	snapshot(schema: Schema): unknown
	/**
	 * The statements from a snapshot, or an empty database, to the models'
	 * snapshot; a required field added takes its `default` in the rows.
	 */
	plan(from: unknown, schema: Schema): readonly Statement[]
	/** The database's snapshot, if it has one; the adapter is started. */
	stored(): Promise<Stored | undefined>
	/**
	 * Applies `run` under a lock that one database holds at a time; a
	 * statement or file the database refuses throws `MigrationFailed`.
	 * `counted` hears what each statement of a deployed file changed, once
	 * the file is committed (D-344).
	 */
	apply(run: Run, counted?: (statement: Counted) => void): Promise<void>
	/**
	 * Drops every table, for `ultimabase reset`; returns the models' tables.
	 * A table another session holds throws a locked `MigrationFailed`.
	 */
	reset(): Promise<readonly string[]>
	/** The database's host when it is not on this machine: `reset` then needs `--force`. */
	readonly remote?: string
}

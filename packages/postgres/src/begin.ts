// A transaction's BEGIN shares its round trip with the first statement (D-297):
// a connection opened with `pipeline` sends a statement without waiting for the
// answers before it, and PostgreSQL still runs them in the order they came.
import type {
	DatabaseConnection,
	Driver,
	PostgresDialectConfig,
	TransactionSettings,
} from 'kysely'
import { PostgresDialect, PostgresDriver } from 'kysely'

class BeginSentDriver extends PostgresDriver {
	/** Each connection's last BEGIN, whose answer may still be on its way. */
	readonly #begun = new WeakMap<DatabaseConnection, Promise<void>>()

	override async beginTransaction(
		connection: DatabaseConnection,
		settings: TransactionSettings,
	): Promise<void> {
		const begun = super.beginTransaction(connection, settings)
		// A BEGIN that fails is heard at the COMMIT, or a ROLLBACK has no use for it.
		begun.catch(() => undefined)
		this.#begun.set(connection, begun)
	}

	override async commitTransaction(
		connection: DatabaseConnection,
	): Promise<void> {
		await super.commitTransaction(connection)
		await this.#begun.get(connection)
	}
}

/** The PostgreSQL dialect, whose transactions do not wait for their BEGIN. */
export class BeginSent extends PostgresDialect {
	readonly #config: PostgresDialectConfig

	constructor(config: PostgresDialectConfig) {
		super(config)
		this.#config = config
	}

	override createDriver(): Driver {
		return new BeginSentDriver(this.#config)
	}
}

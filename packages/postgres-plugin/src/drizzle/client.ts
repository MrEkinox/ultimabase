import {
	drizzle,
	type NodePgClient,
	type NodePgDatabase,
} from 'drizzle-orm/node-postgres'
import type { TablesRelationalConfig } from 'drizzle-orm'

import { postgresDrizzleCodecs } from './codecs.js'

/** Captures the single driver capability shared by pools and borrowed clients. */
export interface PostgresDriverQueryClient {
	query(...arguments_: never[]): unknown
}

/** Keeps the concrete Drizzle database type inside the PostgreSQL package. */
export type PostgresDrizzleClient = NodePgDatabase<TablesRelationalConfig>

/** Wraps a validated pg-compatible query client with the internal Drizzle driver. */
export const createPostgresDrizzleClient = (
	client: PostgresDriverQueryClient,
	relations: TablesRelationalConfig = {},
): PostgresDrizzleClient => {
	// Drizzle only consumes query() here; the narrow public pool contract proves that capability.
	const nodePostgresClient = client as NodePgClient

	return drizzle({
		client: nodePostgresClient,
		codecs: postgresDrizzleCodecs,
		relations,
	})
}

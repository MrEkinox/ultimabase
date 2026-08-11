/** Keeps the official plugin identity shared by definitions and extensions. */
export const postgresPluginName = '@ultimabase/postgres-plugin' as const

/** Names the schema extension that overrides one physical PostgreSQL table. */
export const postgresTableExtensionName = 'postgres.table' as const

/** Names PostgreSQL-owned physical metadata attached to one field. */
export const postgresColumnExtensionName = 'postgres.column' as const

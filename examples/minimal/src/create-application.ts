import {
	MasterAuthority,
	type MasterAccessEvent,
	type UltimaBase,
} from '@ultimabase/core'
import { graphqlYogaPlugin } from '@ultimabase/graphql-yoga-plugin'
import { httpPlugin } from '@ultimabase/http-plugin'
import { passwordAuthPlugin } from '@ultimabase/password-auth-plugin'
import { postgresPlugin, type PostgresPool } from '@ultimabase/postgres-plugin'
import {
	honoServerPlugin,
	type HonoServerPlugin,
} from '@ultimabase/hono-server-plugin'

import { MinimalSchemaApplication, minimalSchemas } from './schema.ts'
import { exampleStatusPlugin } from './status-plugin.ts'

interface MinimalApplicationBaseOptions {
	readonly applicationId?: string
	readonly browserOrigin?: string
	readonly masterKey: string
	readonly masterTransport?: boolean
	readonly onMasterUse?: (event: MasterAccessEvent) => void | PromiseLike<void>
	readonly server?: HonoServerPlugin
}

/**
 * Selects a managed URL, a developer-owned pool, or neither: `DATABASE_URL`
 * is then read when the application starts (ADR-0312).
 */
export type MinimalApplicationOptions = MinimalApplicationBaseOptions &
	(
		| { readonly databasePool: PostgresPool; readonly databaseUrl?: never }
		| { readonly databasePool?: never; readonly databaseUrl?: string }
	)

/** Builds the complete public REST and GraphQL graph without starting it. */
export const createMinimalApplication = ({
	applicationId = 'minimal',
	browserOrigin = 'http://localhost:5173',
	databasePool,
	databaseUrl,
	masterKey,
	masterTransport = true,
	onMasterUse = (event) => {
		process.stdout.write(
			`${JSON.stringify({ kind: event.kind, keyId: event.keyId, requestId: event.requestId })}\n`,
		)
	},
	server = honoServerPlugin({ host: '127.0.0.1', port: 1337 }),
}: MinimalApplicationOptions) => {
	const Application = MinimalSchemaApplication.use(
		passwordAuthPlugin({
			http: {
				cookie: {
					name: '__Host-minimal-session',
					sameSite: 'lax',
				},
			},
		}),
	)
		.use(exampleStatusPlugin)
		.use(
			httpPlugin({
				appId: applicationId,
				browser: {
					allowedHeaders: [
						'Authorization',
						'Content-Type',
						'X-UltimaBase-Application-Id',
						'X-UltimaBase-Master-Key',
						'X-UltimaBase-Request-Id',
					],
					allowedMethods: ['DELETE', 'GET', 'PATCH', 'POST'],
					allowedOrigins: [browserOrigin],
					credentials: true,
					maxAgeSeconds: 600,
				},
				...(masterTransport ? { master: { enabled: true as const } } : {}),
				requestTimeoutMs: 15_000,
			}),
		)
		.use(graphqlYogaPlugin({ introspection: true }))
		.use(server)
		.use(
			postgresPlugin(
				databasePool !== undefined
					? { pool: databasePool, schemaPolicy: 'override' }
					: databaseUrl === undefined
						? { schemaPolicy: 'override' }
						: { schemaPolicy: 'override', url: databaseUrl },
			),
		)

	return new Application({
		masterAuthority: new MasterAuthority({
			keys: [{ id: applicationId, value: masterKey }],
			onUse: onMasterUse,
		}),
		schemas: minimalSchemas,
	})
}

// One declaration per application (ADR-0297 amendment 1). Typegen names these
// old-form schemas; registering the real application would make the Role
// schema reference itself through the registry (TS7022) until Roles moves to
// its schema factory.
declare module '@ultimabase/core' {
	interface Register {
		readonly app: UltimaBase<readonly []>
	}
}

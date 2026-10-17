import process from 'node:process'

import { MasterAuthority, type MasterAccessEvent } from '@ultimabase/core'
import { graphqlYogaPlugin } from '@ultimabase/graphql-yoga-plugin'
import { httpPlugin } from '@ultimabase/http-plugin'
import { postgresPlugin, type PostgresPool } from '@ultimabase/postgres-plugin'
import {
	honoServerPlugin,
	type HonoServerPlugin,
} from '@ultimabase/hono-server-plugin'

import { App } from './app.ts'
import { schemas } from './schema.ts'
import { exampleStatusPlugin } from './status-plugin.ts'

interface UltimabaseBaseOptions {
	readonly applicationId?: string
	readonly browserOrigin?: string
	/** The key the HTTP Master header must match; `ULTIMABASE_MASTER_KEY` at start by default. */
	readonly masterKey?: string
	readonly masterTransport?: boolean
	readonly onMasterUse?: (event: MasterAccessEvent) => void | PromiseLike<void>
	readonly server?: HonoServerPlugin
}

/**
 * Selects a managed URL, a developer-owned pool, or neither: `DATABASE_URL`
 * is then read when the application starts (ADR-0312).
 */
export type UltimabaseOptions = UltimabaseBaseOptions &
	(
		| { readonly databasePool: PostgresPool; readonly databaseUrl?: never }
		| { readonly databasePool?: never; readonly databaseUrl?: string }
	)

/**
 * Builds the complete public REST and GraphQL application without starting
 * it. An application usually exports one `ultimabase` constant; this example
 * exports a function because its end-to-end suites create one instance per
 * suite, each with its own listener, database and HTTP settings. The plugins
 * that only serve or store data join `App` here, when the application is
 * created: the schemas need none of them.
 */
export const createUltimabase = ({
	applicationId = 'full-stack',
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
}: UltimabaseOptions) =>
	new (App.use(
		exampleStatusPlugin,
		httpPlugin({
			appId: applicationId,
			browser: {
				origins: [browserOrigin],
				credentials: true,
				maxAgeSeconds: 600,
			},
			...(masterTransport ? { master: true as const } : {}),
			requestTimeoutMs: 15_000,
		}),
		graphqlYogaPlugin({ introspection: true }),
		server,
		postgresPlugin(
			databasePool !== undefined
				? { pool: databasePool, schemaPolicy: 'override' }
				: databaseUrl === undefined
					? { schemaPolicy: 'override' }
					: { schemaPolicy: 'override', url: databaseUrl },
		),
	))({
		masterAuthority: new MasterAuthority({
			// Read once, at start: importing the application reads no secret.
			keys: () => [
				{
					id: applicationId,
					value: masterKey ?? process.env.ULTIMABASE_MASTER_KEY ?? '',
				},
			],
			onUse: onMasterUse,
		}),
		schemas,
	})

// One declaration per application gives name-keyed editor types (ADR-0297).
declare module '@ultimabase/core' {
	interface Register {
		readonly app: ReturnType<typeof createUltimabase>
	}
}

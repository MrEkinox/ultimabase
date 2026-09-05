import {
	MasterAuthority,
	UltimaBase,
	type MasterAccessEvent,
} from '@ultimabase/core'
import { httpPlugin } from '@ultimabase/http-plugin'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { restPlugin } from '@ultimabase/rest-plugin'
import {
	honoServerPlugin,
	type HonoServerPlugin,
} from '@ultimabase/server-hono-plugin'

import { minimalBehaviorPlugins, minimalSchemas } from './schema.ts'
import { exampleStatusOperation, exampleStatusPlugin } from './status-plugin.ts'

export interface MinimalRestApplicationOptions {
	readonly applicationId?: string
	readonly databaseUrl: string
	readonly masterKey: string
	readonly masterTransport?: boolean
	readonly onMasterUse?: (event: MasterAccessEvent) => void | PromiseLike<void>
	readonly server?: HonoServerPlugin
}

/** Builds the complete public REST graph without starting its resources. */
export const createMinimalRestApplication = ({
	applicationId = 'minimal-rest',
	databaseUrl,
	masterKey,
	masterTransport = true,
	onMasterUse = (event) => {
		process.stdout.write(
			`${JSON.stringify({ kind: event.kind, keyId: event.keyId, requestId: event.requestId })}\n`,
		)
	},
	server = honoServerPlugin({ host: '127.0.0.1', port: 1337 }),
}: MinimalRestApplicationOptions) =>
	new UltimaBase({
		masterAuthority: new MasterAuthority({
			keys: [{ id: applicationId, value: masterKey }],
			onUse: onMasterUse,
		}),
		plugins: [
			...minimalBehaviorPlugins,
			exampleStatusPlugin,
			restPlugin({
				acknowledgeUnverifiedProtection: true,
				operations: [exampleStatusOperation],
			}),
			httpPlugin({
				appId: applicationId,
				browser: {
					allowedHeaders: [
						'Content-Type',
						'X-UltimaBase-Application-Id',
						'X-UltimaBase-Master-Key',
						'X-UltimaBase-Request-Id',
					],
					allowedMethods: ['DELETE', 'GET', 'PATCH', 'POST'],
					allowedOrigins: ['http://localhost:5173'],
					credentials: true,
					maxAgeSeconds: 600,
				},
				...(masterTransport ? { master: { enabled: true as const } } : {}),
				requestTimeoutMs: 15_000,
			}),
			server,
			postgresPlugin({ schemaPolicy: 'override', url: databaseUrl }),
		],
		schemas: minimalSchemas,
	})

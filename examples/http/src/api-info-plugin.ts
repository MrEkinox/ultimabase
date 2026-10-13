//#region api-info-plugin
import {
	httpMount,
	httpRoutes,
	provideHttpEndpoints,
} from '@ultimabase/http-plugin'
import { definePlugin } from '@ultimabase/plugin-kit'

/**
 * A plugin contributes routes like an application does, and mounts that own
 * a whole path subtree. Both run under this plugin's identity.
 */
export const apiInfoPlugin = () =>
	definePlugin({
		name: '@example/api-info',
		contributions: [
			// The same record as `httpPlugin({ routes })`.
			httpRoutes({ 'GET /version': () => Response.json({ api: '2' }) }),
			// Every path below `/v1` answers that the first API is retired.
			provideHttpEndpoints({
				contributionId: 'retired-v1',
				create: () => [
					httpMount({
						path: '/v1',
						protocol: { name: 'example.retired-v1', version: '1' },
						handle: () =>
							Response.json(
								{ error: { code: 'API_RETIRED', message: 'Use /api.' } },
								{ status: 410 },
							),
					}),
				],
			}),
		],
	})
//#endregion api-info-plugin

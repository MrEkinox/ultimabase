//#region status-route
import { plugin } from '@ultimabase/core/plugin'
import { httpRoute, provideHttpEndpoints } from '@ultimabase/http-plugin'

export const statusRoutePlugin = () =>
	plugin({
		contributions: [
			provideHttpEndpoints({
				contributionId: 'status-route',
				create: () => [
					httpRoute({
						method: 'GET',
						path: '/status',
						protocol: { name: 'community.status', version: '1' },
						handle: () => Response.json({ ready: true }),
					}),
				],
			}),
		],
		core: '^0.0.0',
		id: 'community.status-route',
		version: '1.0.0',
	})
//#endregion status-route

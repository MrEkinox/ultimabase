// Route plugin: the route helper belongs to the HTTP plugin (ADR-0316).
import { httpRoutes } from '@ultimabase/http-plugin'
import { definePlugin } from '@ultimabase/plugin-kit'

export const healthPlugin = () =>
	definePlugin({
		name: '@community/health',
		contributions: [
			httpRoutes({ 'GET /health': () => Response.json({ status: 'ok' }) }),
		],
	})

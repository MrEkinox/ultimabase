// Route plugin: the route helper belongs to the HTTP plugin (ADR-0316).
import { httpRoutes } from '@ultimabase/http-plugin'
import { definePlugin } from '@ultimabase/plugin-kit'

export const healthPlugin = () =>
	definePlugin({
		name: '@community/health',
		contributions: [
			// `/health` is the HTTP plugin's built-in route (ADR-0323).
			httpRoutes({ 'GET /status': () => Response.json({ status: 'ok' }) }),
		],
	})

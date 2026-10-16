//#region application
import { App } from './app.ts'
import { clientPlugin } from './client-plugin.ts'
import { formatConsumer, formatProvider } from './format-capability.ts'
import { workflowGraphqlAddon } from './graphql-addon.ts'
import { Comment, Post } from './schema.ts'
import { sessionPlugin } from './sessions-plugin.ts'
import { statusRoutePlugin } from './status-route.ts'
import { workflowPlugin } from './workflow/plugin.ts'

/**
 * Plugins that add no schema method join the factory here, when the
 * application is created; `app.ts` keeps the plugins the schemas need.
 */
export const ultimabase = new (App.use(
	workflowPlugin(),
	workflowGraphqlAddon(),
	statusRoutePlugin(),
	formatProvider,
	formatConsumer,
	clientPlugin,
	sessionPlugin,
))({ schemas: [Post, Comment] })

// One declaration per application gives name-keyed editor types (ADR-0297).
declare module '@ultimabase/core' {
	interface Register {
		readonly app: typeof ultimabase
	}
}
//#endregion application

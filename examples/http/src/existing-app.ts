//#region existing-app
import { UltimaBase } from '@ultimabase/core'
import { honoServerPlugin } from '@ultimabase/hono-server-plugin'
import { httpPlugin } from '@ultimabase/http-plugin'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { restPlugin } from '@ultimabase/rest-plugin'
import { Hono } from 'hono'

/** An existing Hono application keeps its own routes and its listener. */
export const app = new Hono()
app.get('/ping', (context) => context.text('pong'))

/**
 * The plugins `apiServer()` installs, one by one. With `app`, the Hono
 * server plugin adds UltimaBase's routes to it but never starts or stops it.
 */
export const AdminApp = UltimaBase.use(
	httpPlugin({ appId: 'links-admin' }),
	// Reports are produced server-side: REST only reads them.
	restPlugin({
		default: { createOne: false, updateOne: false, deleteOne: false },
	}),
	honoServerPlugin({ app }),
	postgresPlugin(),
)

export const Report = AdminApp.Schema.define({
	className: 'Report',
	fields: (field) => ({ title: field.string({ required: true }) }),
})

export const admin = new AdminApp({ schemas: [Report] })
//#endregion existing-app

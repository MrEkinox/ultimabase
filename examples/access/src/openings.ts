import { accessPlugin } from '@ultimabase/access-plugin'
import { isAuthenticated } from '@ultimabase/core'

import { App } from './app.ts'

//#region draft
/** No Access rule at all: denied unless `allowWithoutRule` opens it. */
export const Draft = App.Schema.define({
	className: 'Draft',
	fields: (field) => ({ title: field.string({ required: true }) }),
})
//#endregion draft

// This application installs plain `accessPlugin()`. Each function below
// configures Access for another application; the tests start each one.

//#region openings
/** Reads open, production included; native writes and commands stay denied. */
export const readOnlyAccess = () =>
	accessPlugin({ allowWithoutRule: { all: true, write: false } })

/** Reads open except counts; authenticated callers may write. */
export const memberWritesAccess = () =>
	accessPlugin({
		allowWithoutRule: { read: true, count: false, write: isAuthenticated },
	})

/** Everything open outside production; in production, `start()` fails. */
export const developmentAccess = () =>
	accessPlugin({ allowWithoutRule: { all: 'development' } })
//#endregion openings

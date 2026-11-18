// The application: REST over HTTP, password sign-in, and push.
//#region plugin
import { authPlugin } from '@ultimabase/auth'
import { httpPlugin } from '@ultimabase/http'
import { passwordPlugin } from '@ultimabase/password'
import { pushPlugin } from '@ultimabase/push'
import { restPlugin } from '@ultimabase/rest'
import { defineApp, memory } from 'ultimabase'
import {
	pushKey,
	subscribePush,
	testPush,
	unsubscribePush,
} from './functions.ts'
import { User } from './user.ts'

// The keys `npx @ultimabase/push keys` printed. Without them the
// application starts, warns once, and sends nothing.
const notifications = pushPlugin({
	web: {
		publicKey: process.env['PUSH_WEB_PUBLIC_KEY'],
		privateKey: process.env['PUSH_WEB_PRIVATE_KEY'],
		subject: 'mailto:ops@example.com',
	},
})
//#endregion

//#region app
export const app = defineApp({
	// Kept in memory, so the example needs no database.
	database: memory(),
	// Listens on PORT, or 3000; push needs auth's sessions.
	plugins: [
		httpPlugin(),
		restPlugin(),
		authPlugin(),
		passwordPlugin(),
		notifications,
	],
	models: [User],
	functions: [pushKey, subscribePush, unsubscribePush, testPush],
})
//#endregion

// The application's own functions around push: the plugin adds none, so
// the application names them and sets their rules.
import { isAuthenticated, signedInRun } from '@ultimabase/auth'
import { push } from '@ultimabase/push'
import { allow, defineFunction } from 'ultimabase'
import { z } from 'zod'

//#region key
// The browser's `applicationServerKey`: null without web keys.
export const pushKey = defineFunction({
	name: 'pushKey',
	query: true,
	output: z.string().nullable(),
	run: () => push.publicKey ?? null,
}).with({ access: allow.public })
//#endregion

//#region subscribe
// Saves the browser of the caller's session; false without web keys.
export const subscribePush = defineFunction({
	name: 'subscribePush',
	input: z.object({
		endpoint: z.string(),
		p256dh: z.string(),
		auth: z.string(),
	}),
	output: z.boolean(),
	run: signedInRun(({ caller, input }) =>
		push.register(caller, { web: input }),
	),
}).with({ access: isAuthenticated })

// Turns notifications off on this device only.
export const unsubscribePush = defineFunction({
	name: 'unsubscribePush',
	run: signedInRun(({ caller }) => push.unregister(caller)),
}).with({ access: isAuthenticated })
//#endregion

//#region send
// A "send me a test" button. A job calls push.send the same way, after the
// application's own filters, as the user's settings.
export const testPush = defineFunction({
	name: 'testPush',
	output: z.object({ sent: z.int(), gone: z.int(), failed: z.int() }),
	run: signedInRun(({ user }) =>
		push.send(
			[user.id],
			{
				title: 'Notifications are on',
				body: 'This device receives them.',
				url: '/settings',
				tag: 'test',
			},
			// Dropped if the device stays offline a minute: a test is for now.
			{ ttl: 60, urgency: 'high' },
		),
	),
}).with({ access: isAuthenticated })
//#endregion

// The application: an HTTP API on the in-memory database. It sells what
// `src/catalog.ts` declares; Stripe's events reach it on its webhook, and
// its jobs write them to the billing models.
import { httpPlugin } from '@ultimabase/http'
import { jobsPlugin } from '@ultimabase/jobs'
import { stripePlugin } from '@ultimabase/stripe'
import { defineApp, memory } from 'ultimabase'
import { Balance, Purchase, Subscription, User } from './models.ts'
import { selling } from './stripe.ts'

//#region plugin
const secret = process.env['STRIPE_SECRET_KEY']
const webhook = process.env['STRIPE_WEBHOOK_SECRET']

const stripe = stripePlugin({
	// Without them, the application starts and payments are unavailable.
	keys: secret && webhook ? { secret, webhook } : undefined,
	...selling,
	// What Stripe shows of a user.
	customer: (user: { readonly email: string }) => ({ email: user.email }),
	// The defaults: Stripe posts its events here, and a user may hold
	// several subscriptions; `true` refuses a second one, and cancels and
	// refunds one made anyway.
	webhookPath: '/webhooks/stripe',
	oneSubscription: false,
})
//#endregion

//#region app
export const app = defineApp({
	// Kept in memory, so the example needs no database.
	database: memory(),
	// Listens on PORT, or 3000; runs each Stripe event's job, and the hourly
	// reconciliation, which catches the events the webhook missed.
	plugins: [httpPlugin(), jobsPlugin({ jobs: [] }), stripe],
	models: [User, Subscription, Purchase, Balance],
})
//#endregion

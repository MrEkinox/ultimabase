// An application that sells with the plugin, on a fake Stripe account: a
// user pays subscriptions and gem packs, and keeps a balance of gems.
import { httpPlugin } from '@ultimabase/http'
import { jobsPlugin } from '@ultimabase/jobs'
import type { Logger } from 'ultimabase'
import { allow, defineApp, defineModel, master, memory } from 'ultimabase'
import {
	defineBalance,
	definePurchase,
	defineSubscription,
} from '../billing.ts'
import { defineCredit } from '../credit.ts'
import type { StripeOptions } from '../plugin.ts'
import { stripePlugin } from '../plugin.ts'
import { defineProduct } from '../product.ts'
import type { FakeStripe } from '../testing.ts'
import { fakeStripe } from '../testing.ts'

export const M = { as: master }

export const User = defineModel({
	name: 'User',
	fields: (f) => ({ email: f.string(), name: f.string({ optional: true }) }),
})
// Public, so that only the plugin's hooks keep a user from writing them.
export const Subscription = defineSubscription({
	name: 'Subscription',
	payer: () => User,
}).with({ access: allow.public })
export const Purchase = definePurchase({
	name: 'Purchase',
	payer: () => User,
	fields: (f) => ({ note: f.string({ optional: true }) }),
}).with({ access: allow.public })
export const Balance = defineBalance({
	name: 'Balance',
	owner: () => User,
}).with({ access: allow.public })

export const gems = defineCredit({ key: 'gems' })
export const pro = defineProduct({
	key: 'pro',
	name: 'Pro',
	prices: {
		monthly: { amount: 9_90, every: 'month' },
		yearly: { amount: 99_00, every: 'year' },
	},
})
export const team = defineProduct({
	key: 'team',
	name: 'Team',
	prices: { monthly: { amount: 29_00, every: 'month' } },
})
export const gemPack = defineProduct({
	key: 'gemPack',
	name: '500 gems',
	price: { amount: 4_90 },
	gives: [gems(500)],
})

/** What the application logged, a line each. */
export type Line = {
	readonly level: 'info' | 'warn' | 'error'
	readonly message: string
	readonly details: object
}

function loggerOf(lines: Line[]): Logger {
	const at =
		(level: Line['level']) =>
		(first: object | string, message?: string): void => {
			lines.push(
				typeof first === 'string'
					? { level, message: first, details: {} }
					: { level, message: message ?? '', details: first },
			)
		}
	const logger: Logger = {
		info: at('info'),
		warn: at('warn'),
		error: at('error'),
		child: () => logger,
	}
	return logger
}

/** The application, its fake Stripe account and its log. */
export function billingApp(options: Partial<StripeOptions> = {}): {
	readonly app: object
	readonly fake: FakeStripe
	readonly lines: Line[]
} {
	const fake = fakeStripe()
	const lines: Line[] = []
	const app = defineApp({
		database: memory(),
		models: [User, Subscription, Purchase, Balance],
		plugins: [
			httpPlugin(),
			jobsPlugin({ jobs: [] }),
			stripePlugin({
				keys: { secret: fake.secret, webhook: fake.webhookSecret },
				currency: 'eur',
				products: [pro, team, gemPack],
				portal: { returnUrl: 'https://app.test/account' },
				customer: (user: { readonly email: string }) => ({
					email: user.email,
				}),
				...options,
			}),
		],
		logger: loggerOf(lines),
	})
	return { app, fake, lines }
}

export const urls = {
	successUrl: 'https://app.test/paid?session={CHECKOUT_SESSION_ID}',
	cancelUrl: 'https://app.test/shop',
}

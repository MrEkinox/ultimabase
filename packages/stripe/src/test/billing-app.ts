// An application that sells with the plugin, on a fake Stripe account: a
// user pays subscriptions and gem packs, and keeps a balance of gems.
import { graphqlPlugin } from '@ultimabase/graphql'
import { httpPlugin } from '@ultimabase/http'
import { jobsPlugin } from '@ultimabase/jobs'
import { restPlugin } from '@ultimabase/rest'
import type { TestApplication } from '@ultimabase/testing'
import { testApplication } from '@ultimabase/testing'
import type { Logger } from 'ultimabase'
import {
	allow,
	defineApp,
	defineEnum,
	defineModel,
	master,
	memory,
} from 'ultimabase'
import { afterEach, expect } from 'vitest'
import {
	defineBalance,
	defineCreditHistory,
	definePurchase,
	defineSubscription,
} from '../billing.ts'
import { defineCredit } from '../credit.ts'
import type { StripeOptions } from '../plugin.ts'
import { stripePayer, stripePlugin } from '../plugin.ts'
import { defineProduct } from '../product.ts'
import type { FakeStripe } from '../testing.ts'
import { fakeStripe } from '../testing.ts'

export const M = { as: master }

// A user reads, updates and deletes its own account, and its billing rows
// with it.
export const User = defineModel({
	name: 'User',
	use: [stripePayer()],
	fields: (f) => ({
		email: f.string(),
		name: f.string({ optional: true }),
		lang: f.string({ optional: true }),
	}),
}).with({
	access: {
		read: ({ caller, where }) =>
			caller.kind === 'user' && where({ id: { equals: caller.user.id } }),
		update: ({ caller, where }) =>
			caller.kind === 'user' && where({ id: { equals: caller.user.id } }),
		delete: ({ caller, where }) =>
			caller.kind === 'user' && where({ id: { equals: caller.user.id } }),
	},
})
// The catalog's keys and price names, which type the rows (D-387); a key
// the catalog dropped stays in its enum while rows hold it.
export const Plan = defineEnum('Plan', ['pro', 'team', 'legacy'])
export const Period = defineEnum('Period', ['monthly', 'yearly'])
export const Pack = defineEnum('Pack', ['gemPack'])
// Public, so that only the plugin's hooks keep a user from writing them.
export const Subscription = defineSubscription({
	name: 'Subscription',
	payer: () => User,
	product: Plan,
	price: Period,
}).with({ access: allow.public })
export const Purchase = definePurchase({
	name: 'Purchase',
	payer: () => User,
	product: Pack,
	fields: (f) => ({ note: f.string({ optional: true }) }),
}).with({ access: allow.public })
export const Balance = defineBalance({
	name: 'Balance',
	owner: () => User,
}).with({ access: allow.public })
export const CreditHistory = defineCreditHistory({
	name: 'CreditHistory',
	owner: () => User,
}).with({ access: allow.public })

export const gems = defineCredit({ key: 'gems' })
export const pro = defineProduct({
	key: 'pro',
	name: 'Pro',
	prices: {
		monthly: { amount: 9_90, every: 'month', gives: [gems(100)] },
		yearly: {
			amount: 99_00,
			every: 'year',
			gives: [gems(1_200)],
			trialDays: 30,
		},
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

/**
 * The application, its fake Stripe account and its log; `served` adds
 * GraphQL and REST.
 */
export function billingApp(
	options: Partial<StripeOptions> = {},
	served = false,
): {
	readonly app: object
	readonly fake: FakeStripe
	readonly lines: Line[]
} {
	const fake = fakeStripe()
	const lines: Line[] = []
	const app = defineApp({
		database: memory(),
		models: [User, Subscription, Purchase, Balance, CreditHistory],
		plugins: [
			httpPlugin(),
			jobsPlugin({ jobs: [] }),
			stripePlugin({
				keys: { secret: fake.secret, webhook: fake.webhookSecret },
				currency: 'eur',
				products: [pro, team, gemPack],
				portal: { returnUrl: 'https://app.test/account' },
				customer: (user: {
					readonly email: string
					readonly lang: string | null
				}) => ({ email: user.email, locale: user.lang }),
				...options,
			}),
			...(served ? [graphqlPlugin(), restPlugin()] : []),
		],
		logger: loggerOf(lines),
	})
	return { app, fake, lines }
}

export const urls = {
	successUrl: 'https://app.test/paid?session={CHECKOUT_SESSION_ID}',
	cancelUrl: 'https://app.test/shop',
}

/**
 * The balances that are not the sum of their history, by payer and credit,
 * and the moves that belong to no payer.
 */
async function ledgerGaps(): Promise<{
	readonly gaps: readonly object[]
	readonly ownerless: number
}> {
	const gaps: object[] = []
	let owned = 0
	for (const { id, email } of await User.findMany({}, M)) {
		const where = { owner: { is: { id } } }
		const balances = new Map<string, number>()
		for (const { credit, amount } of await Balance.findMany({ where }, M)) {
			balances.set(credit, amount)
		}
		const sums = new Map<string, number>()
		const moves = await CreditHistory.findMany({ where }, M)
		for (const { credit, change } of moves) {
			sums.set(credit, (sums.get(credit) ?? 0) + change)
		}
		owned += moves.length
		for (const credit of new Set([...balances.keys(), ...sums.keys()])) {
			const balance = balances.get(credit) ?? 0
			const history = sums.get(credit) ?? 0
			if (balance !== history) gaps.push({ email, credit, balance, history })
		}
	}
	return { gaps, ownerless: (await CreditHistory.count({}, M)) - owned }
}

/**
 * The application's test, which checks after each test that every balance
 * is the sum of its history, payer by payer and credit by credit, and that
 * every move has a payer (D-377). After hooks run last registered first: the
 * gaps are read before the application stops, and a gap fails the test once
 * it stopped, so that the next test still starts.
 */
export function billingTest(app: object): TestApplication {
	let found: object = {}
	afterEach(() => {
		expect(found, 'Each balance is the sum of its history.').toEqual({
			gaps: [],
			ownerless: 0,
		})
	})
	const test = testApplication(app)
	afterEach(async () => {
		found = await ledgerGaps().catch((error: unknown) => ({ error }))
	})
	return test
}

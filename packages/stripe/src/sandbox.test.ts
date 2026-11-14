// @ultimabase/stripe/sandbox (D-401) on a fake Stripe API: what each helper
// asks Stripe, and what `deliver` posts to a running application's webhook.
import type { Stripe } from 'stripe'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { applyStripeCatalog } from './apply.ts'
import { StripeCustomer, StripeEvent } from './models.ts'
import { stripeSandbox } from './sandbox.ts'
import { billingApp, billingTest, M, pro, User } from './test/billing-app.ts'
import type { StripeRequest } from './test/stripe-api.ts'
import { stripeApi, stripeError, stripeList } from './test/stripe-api.ts'
import { fakeStripe } from './testing.ts'

// The sandbox's key reaches the fake API; any other reaches the real client.
const held = vi.hoisted(() => ({ client: undefined as Stripe | undefined }))
vi.mock(import('./gateway.ts'), async (original) => {
	const gateway = await original()
	return {
		...gateway,
		stripeClient: (secret: string): Stripe =>
			secret === 'sk_test_sandbox' && held.client !== undefined
				? held.client
				: gateway.stripeClient(secret),
	}
})

const { app, fake } = billingApp()
const test = billingTest(app)

afterEach(() => {
	vi.useRealTimers()
	vi.restoreAllMocks()
})

/** A route answers with what it returns, or with itself. */
const answers = (
	answer: unknown,
): answer is (request: StripeRequest) => unknown => typeof answer === 'function'

/** A sandbox whose API answers `routes`, keyed `GET /v1/prices`. */
function sandboxOn(routes: Readonly<Record<string, unknown>>) {
	const api = stripeApi((request) => {
		const route = `${request.method} ${request.path}`
		if (!(route in routes)) {
			return stripeError(404, { type: 'invalid_request_error', code: route })
		}
		const answer = routes[route]
		return answers(answer) ? answer(request) : answer
	})
	held.client = api.client
	const sandbox = stripeSandbox({
		secret: 'sk_test_sandbox',
		webhook: fake.webhookSecret,
	})
	return { sandbox, requests: api.requests }
}

const gone = stripeError(404, {
	type: 'invalid_request_error',
	code: 'resource_missing',
})

/** A sandbox whose clock clock_1 reports `statuses`, one per read. */
const clock = (...statuses: string[]) =>
	sandboxOn({
		'GET /v1/test_helpers/test_clocks/clock_1': () => ({
			id: 'clock_1',
			frozen_time: 1_000,
			status: statuses.length > 1 ? statuses.shift() : statuses[0],
		}),
		'POST /v1/test_helpers/test_clocks/clock_1/advance': { id: 'clock_1' },
	})

const event = (id: string, type: string, object: object) => ({
	id,
	type,
	data: { object },
})

/** The ids of the events `fetched` posted to the application. */
const posted = (fetched: { mock: { calls: unknown[][] } }): unknown[] =>
	fetched.mock.calls
		.filter(([url]) => String(url).startsWith(test.url))
		.map(([, init]): unknown => {
			const body: unknown = JSON.parse(
				String(Reflect.get(Object(init), 'body')),
			)
			return Reflect.get(Object(body), 'id')
		})

/** A sandbox whose one customer's deletion answers `deleted`. */
const deleting = (deleted: unknown) =>
	sandboxOn({
		'GET /v1/customers': stripeList([{ id: 'cus_9' }]),
		'DELETE /v1/customers/cus_9': deleted,
	})

describe('stripeSandbox', () => {
	it.each([
		[
			{ secret: undefined, webhook: 'whsec_1' },
			'stripeSandbox: secret is the secret key of a Stripe sandbox, sk_test_…: set it in the environment that runs these tests.',
		],
		[
			{ secret: 'sk_live_1', webhook: 'whsec_1' },
			'stripeSandbox runs on a sandbox only: secret is a test secret key, sk_test_….',
		],
		[
			{ secret: 'sk_test_1', webhook: '' },
			"stripeSandbox: webhook is the webhook secret of the application's stripePlugin.",
		],
		[
			{ secret: 'sk_test_1', webhook: 'whsec_1', key: 'sk_test_1' },
			'stripeSandbox takes no key.',
		],
	])('refuses %j', (options, message) => {
		expect(() => stripeSandbox(options)).toThrow(message)
	})

	it('names its addresses after the run', () => {
		const { sandbox } = sandboxOn({})
		expect(sandbox.run).toMatch(/^ub_[0-9a-z]+_[0-9a-f]{6}$/u)
		expect(sandbox.email('ada')).toBe(`${sandbox.run}-ada@example.com`)
	})

	it.each([
		[[], 'Stripe holds no customers of ada@example.com: expected one.'],
		[
			[{ id: 'cus_1' }, { id: 'cus_2' }],
			'Stripe holds several customers of ada@example.com: expected one.',
		],
	])('refuses %j as the customer of an address', async (customers, message) => {
		const { sandbox } = sandboxOn({
			'GET /v1/customers': stripeList(customers),
		})
		await expect(sandbox.customerOf('ada@example.com')).rejects.toThrow(message)
	})

	it('finds an active price by its lookup key', async () => {
		const { sandbox, requests } = sandboxOn({
			'GET /v1/prices': ({ params }: StripeRequest) =>
				stripeList(
					params['lookup_keys[0]'] === 'pro.monthly' ? [{ id: 'price_1' }] : [],
				),
		})
		expect(await sandbox.priceId('pro.monthly')).toBe('price_1')
		expect(requests[0]?.params).toMatchObject({ active: 'true' })
		await expect(sandbox.priceId('pro.weekly')).rejects.toThrow(
			'No active price of the sandbox is pro.weekly.',
		)
	})
})

describe('payer', () => {
	it('puts a customer that pays on a clock, and records it as the payer’s', async () => {
		const { sandbox, requests } = sandboxOn({
			'POST /v1/test_helpers/test_clocks': { id: 'clock_1' },
			'POST /v1/customers': { id: 'cus_1' },
			'POST /v1/payment_methods/pm_card_mastercard/attach': { id: 'pm_1' },
			'POST /v1/customers/cus_1': { id: 'cus_1' },
		})
		const ada = await User.create({ data: { email: 'ada@example.com' } }, M)
		const email = sandbox.email('ada')
		vi.useFakeTimers({ toFake: ['Date'], now: 1_700_000_000_500 })
		expect(
			await sandbox.payer({
				model: User,
				id: ada.id,
				email,
				card: 'pm_card_mastercard',
			}),
		).toEqual({ customer: 'cus_1', clock: 'clock_1', method: 'pm_1' })
		expect(requests.map(({ params }) => params)).toEqual([
			{ frozen_time: '1700000000', name: sandbox.run },
			{
				email,
				test_clock: 'clock_1',
				'metadata[managedBy]': 'ultimabase',
			},
			{ customer: 'cus_1' },
			{ 'invoice_settings[default_payment_method]': 'pm_1' },
		])
		const where = { model: 'User', payer: ada.id }
		expect(await StripeCustomer.findUnique({ where }, M)).toMatchObject({
			stripeId: 'cus_1',
		})
	})
})

describe('advance', () => {
	it('moves the clock, and waits until Stripe is ready', async () => {
		const { sandbox, requests } = clock('ready', 'advancing', 'ready')
		vi.useFakeTimers({ toFake: ['setTimeout'] })
		const moved = sandbox.advance('clock_1', { days: 2 })
		await vi.advanceTimersByTimeAsync(2_000)
		await moved
		expect(requests[1]?.params).toEqual({
			frozen_time: String(1_000 + 2 * 86_400),
		})
		expect(requests).toHaveLength(4)
	})

	it('throws when the clock fails, or never gets ready', async () => {
		await expect(
			clock('internal_failure').sandbox.advance('clock_1', { days: 1 }),
		).rejects.toThrow('The test clock clock_1 failed at Stripe.')
		vi.useFakeTimers({ toFake: ['setTimeout'] })
		const late = clock('advancing')
			.sandbox.advance('clock_1', { days: 1 })
			.catch((error: unknown) => error)
		await vi.advanceTimersByTimeAsync(180_000)
		expect(await late).toMatchObject({
			message: 'The test clock clock_1 took more than 3 minutes.',
		})
	})

	it('refuses a number of days that is not positive', async () => {
		await expect(
			clock('ready').sandbox.advance('clock_1', { days: 0 }),
		).rejects.toThrow('advance: days is a positive number.')
	})
})

describe('deliver', () => {
	const events = [
		event('evt_1', 'customer.subscription.updated', {
			id: 'sub_1',
			object: 'subscription',
			customer: 'cus_1',
		}),
		event('evt_2', 'customer.subscription.updated', {
			id: 'sub_2',
			object: 'subscription',
			customer: 'cus_other',
		}),
		event('evt_3', 'charge.dispute.created', {
			id: 'dp_1',
			object: 'dispute',
			charge: 'ch_1',
		}),
		event('evt_4', 'product.updated', { id: 'prod_1', object: 'product' }),
		event('evt_5', 'customer.updated', { id: 'cus_1', object: 'customer' }),
		event('evt_6', 'invoice.paid', {
			id: 'in_1',
			object: 'invoice',
			customer: { id: 'cus_1' },
		}),
		event('evt_7', 'invoice.paid', {
			id: 'in_2',
			object: 'invoice',
			customer: 'cus_2',
		}),
	]
	const delivering = () =>
		sandboxOn({
			'GET /v1/customers': ({ params }: StripeRequest) =>
				stripeList([
					{ id: params['email'] === 'bob@example.com' ? 'cus_2' : 'cus_1' },
				]),
			'POST /v1/test_helpers/test_clocks': { id: 'clock_1' },
			'POST /v1/customers': { id: 'cus_1' },
			'POST /v1/payment_methods/pm_card_visa/attach': { id: 'pm_1' },
			'POST /v1/customers/cus_1': { id: 'cus_1' },
			'GET /v1/events': stripeList(events),
			'GET /v1/disputes/dp_1': { id: 'dp_1', charge: 'ch_1' },
			'GET /v1/charges/ch_1': { id: 'ch_1', customer: 'cus_1' },
		})

	it("posts the run's customers' events once, signed", async () => {
		const { sandbox, requests } = delivering()
		await sandbox.customerOf('ada@example.com')
		await sandbox.customerOf('bob@example.com')
		const fetched = vi.spyOn(globalThis, 'fetch')
		await sandbox.deliver(test.url)
		const run = ['evt_1', 'evt_3', 'evt_5', 'evt_6', 'evt_7']
		expect(posted(fetched)).toEqual(run)
		// The webhook took each signature.
		const stored = await StripeEvent.findMany(
			{ orderBy: { stripeId: 'asc' } },
			M,
		)
		expect(stored.map(({ stripeId }) => stripeId)).toEqual(run)
		// A test clock's first events may come a little before the run.
		const since = Number(
			requests.find(({ path }) => path === '/v1/events')?.params[
				'created[gte]'
			],
		)
		expect(since).toBeLessThanOrEqual(Math.floor(Date.now() / 1000) - 60)

		fetched.mockClear()
		await sandbox.deliver(test.url)
		expect(posted(fetched)).toEqual([])
		await sandbox.deliver(test.url, { again: 'cus_1' })
		expect(posted(fetched)).toEqual(['evt_1', 'evt_3', 'evt_5', 'evt_6'])
		// A dispute's owner is asked once.
		expect(
			requests.filter(({ path }) => path === '/v1/disputes/dp_1'),
		).toHaveLength(1)
	})

	it("throws when the webhook refuses a payer's event", async () => {
		const { sandbox } = delivering()
		const ada = await User.create({ data: { email: 'ada@example.com' } }, M)
		await sandbox.payer({ model: User, id: ada.id })
		await expect(sandbox.deliver(test.url, { path: '/hooks' })).rejects.toThrow(
			'The webhook answered 404 to customer.subscription.updated.',
		)
	})
})

describe('cleanup', () => {
	it("deletes the run's clocks and the customers of its addresses", async () => {
		const { sandbox, requests } = sandboxOn({
			'POST /v1/test_helpers/test_clocks': { id: 'clock_1' },
			'POST /v1/customers': { id: 'cus_1' },
			'POST /v1/payment_methods/pm_card_visa/attach': { id: 'pm_1' },
			'POST /v1/customers/cus_1': { id: 'cus_1' },
			'DELETE /v1/test_helpers/test_clocks/clock_1': { deleted: true },
			'GET /v1/customers': ({ params }: StripeRequest) =>
				stripeList(
					params['email']?.endsWith('-bob@example.com')
						? [{ id: 'cus_2' }]
						: [],
				),
			'DELETE /v1/customers/cus_2': { deleted: true },
			'DELETE /v1/customers/cus_9': gone,
		})
		const ada = await User.create({ data: { email: 'ada@example.com' } }, M)
		await sandbox.payer({ model: User, id: ada.id })
		await sandbox.customerOf(sandbox.email('bob'))
		requests.length = 0
		await sandbox.cleanup()
		expect(requests.map(({ method, path }) => `${method} ${path}`)).toEqual([
			'DELETE /v1/test_helpers/test_clocks/clock_1',
			'GET /v1/customers',
			'DELETE /v1/customers/cus_2',
		])
	})

	it('takes a customer already gone, and throws any other failure', async () => {
		const done = deleting(gone).sandbox
		await done.customerOf('ada@example.com')
		await done.cleanup()
		const broken = deleting(stripeError(500, { type: 'api_error' })).sandbox
		await broken.customerOf('ada@example.com')
		await expect(broken.cleanup()).rejects.toThrow('Refused.')
	})
})

describe('expectCatalog', () => {
	it('throws the changes the sandbox needs, until they are applied', async () => {
		const account = fakeStripe()
		const sandbox = stripeSandbox({
			secret: account.secret,
			webhook: 'whsec_1',
		})
		const catalog = {
			currency: 'eur',
			products: [pro],
			portal: { returnUrl: 'https://app.test/account' },
		}
		await expect(sandbox.expectCatalog(catalog)).rejects.toThrow(
			/^The sandbox's catalog differs from the code, \d+ changes:\n {2}.+[\s\S]*\napplyStripeCatalog with the sandbox key applies them\.$/u,
		)
		vi.spyOn(process.stdout, 'write').mockReturnValue(true)
		await applyStripeCatalog({ secret: account.secret, ...catalog })
		await sandbox.expectCatalog(catalog)
		await expect(
			sandbox.expectCatalog({ ...catalog, dryRun: true } as typeof catalog),
		).rejects.toThrow('expectCatalog takes no dryRun.')
	})
})

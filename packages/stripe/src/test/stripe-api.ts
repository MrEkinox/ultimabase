// A Stripe client whose requests reach the test instead of Stripe: the
// gateway's tests read what it sends, and answer as the API does.
import { Stripe } from 'stripe'

/** A request the fake API received. */
export interface StripeRequest {
	readonly method: string
	/** Without the query: `/v1/products`. */
	readonly path: string
	/** The query's or the form body's fields, as Stripe encodes them. */
	readonly params: Readonly<Record<string, string>>
}

/** A Stripe client whose requests `answer` answers, listed in `requests`. */
export const stripeApi = (
	answer: (request: StripeRequest) => unknown,
): { client: Stripe; requests: StripeRequest[] } => {
	const requests: StripeRequest[] = []
	const fetchFn = (url: string | URL | Request, init?: RequestInit) => {
		const parsed = new URL(url instanceof Request ? url.url : url)
		const body = typeof init?.body === 'string' ? init.body : ''
		const request: StripeRequest = {
			method: init?.method ?? 'GET',
			path: parsed.pathname,
			params: Object.fromEntries(
				new URLSearchParams(parsed.search === '' ? body : parsed.search),
			),
		}
		requests.push(request)
		return Promise.resolve(
			new Response(JSON.stringify(answer(request)), {
				headers: { 'content-type': 'application/json' },
			}),
		)
	}
	const client = new Stripe('sk_test_api', {
		httpClient: Stripe.createFetchHttpClient(fetchFn),
		maxNetworkRetries: 0,
	})
	return { client, requests }
}

/** A list as the API answers it, with more pages when `hasMore`. */
export const stripeList = (
	data: readonly unknown[],
	hasMore = false,
): unknown => ({ object: 'list', data, has_more: hasMore, url: '/v1/list' })

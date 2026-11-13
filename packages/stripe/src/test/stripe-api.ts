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
	readonly idempotencyKey: string | null
}

/** An error as the API answers it, with its HTTP status. */
export const stripeError = (
	status: number,
	error: { readonly type: string; readonly code?: string },
): Response =>
	new Response(JSON.stringify({ error: { message: 'Refused.', ...error } }), {
		status,
		headers: { 'content-type': 'application/json' },
	})

/**
 * A Stripe client whose requests `answer` answers, listed in `requests`; an
 * answer that is a `Response` is sent as is.
 */
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
			idempotencyKey: new Headers(init?.headers).get('idempotency-key'),
		}
		requests.push(request)
		const answered = answer(request)
		return Promise.resolve(
			answered instanceof Response
				? answered
				: new Response(JSON.stringify(answered), {
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

// The recovery gateway over Stripe's API (D-375): what it sends to end and
// refund a second subscription, and which customers it reads from Stripe's
// events; on a client the test answers.
import { describe, expect, it } from 'vitest'
import { Missing } from './billing-gateway.ts'
import { sdkRecovery } from './sdk-recovery.ts'
import type { StripeRequest } from './test/stripe-api.ts'
import { stripeApi, stripeError, stripeList } from './test/stripe-api.ts'

/** The gateway on a client whose requests `answer` answers. */
const gatewayOn = (answer: (request: StripeRequest) => unknown) => {
	const { client, requests } = stripeApi(answer)
	return { gateway: sdkRecovery(client), requests }
}

const sent = (requests: readonly StripeRequest[]) =>
	requests.map(({ method, path }) => `${method} ${path}`)

const invoicePayment = (payment: object) => ({
	id: 'inpay_1',
	object: 'invoice_payment',
	payment,
})

describe('cancelAndRefund', () => {
	it('ends a live subscription and refunds its latest payment once', async () => {
		const { gateway, requests } = gatewayOn(({ path }) => {
			switch (path) {
				case '/v1/subscriptions/sub_2':
					return { id: 'sub_2', status: 'active', latest_invoice: 'in_2' }
				case '/v1/invoice_payments':
					return stripeList([
						invoicePayment({ type: 'payment_intent', payment_intent: 'pi_2' }),
					])
				default:
					return { id: 'x' }
			}
		})
		await gateway.cancelAndRefund('sub_2')
		expect(sent(requests)).toStrictEqual([
			'GET /v1/subscriptions/sub_2',
			'DELETE /v1/subscriptions/sub_2',
			'GET /v1/invoice_payments',
			'POST /v1/refunds',
		])
		expect(requests[1]?.params).toStrictEqual({ prorate: 'false' })
		expect(requests[2]?.params).toMatchObject({
			invoice: 'in_2',
			status: 'paid',
		})
		expect(requests[3]).toMatchObject({
			params: { payment_intent: 'pi_2' },
			idempotencyKey: 'refund-pi_2',
		})
	})

	it('refunds an ended one by its charge, and what Stripe refunded already', async () => {
		const { gateway, requests } = gatewayOn(({ path, params }) => {
			switch (path) {
				case '/v1/subscriptions/sub_2':
					return {
						id: 'sub_2',
						status: 'canceled',
						latest_invoice: { id: 'in_2', object: 'invoice' },
					}
				case '/v1/invoice_payments':
					return stripeList([
						invoicePayment({ type: 'charge', charge: { id: 'ch_1' } }),
						invoicePayment({ type: 'charge', charge: 'ch_2' }),
						invoicePayment({ type: 'out_of_band_payment' }),
					])
				default:
					return params.charge === 'ch_1'
						? stripeError(400, {
								type: 'invalid_request_error',
								code: 'charge_already_refunded',
							})
						: { id: 're_2' }
			}
		})
		await gateway.cancelAndRefund('sub_2')
		expect(sent(requests)).toStrictEqual([
			'GET /v1/subscriptions/sub_2',
			'GET /v1/invoice_payments',
			'POST /v1/refunds',
			'POST /v1/refunds',
		])
		expect(
			requests.slice(2).map(({ params, idempotencyKey }) => ({
				params,
				idempotencyKey,
			})),
		).toStrictEqual([
			{ params: { charge: 'ch_1' }, idempotencyKey: 'refund-ch_1' },
			{ params: { charge: 'ch_2' }, idempotencyKey: 'refund-ch_2' },
		])
	})

	it('stops at a subscription with no invoice', async () => {
		const { gateway, requests } = gatewayOn(() => ({
			id: 'sub_2',
			status: 'incomplete_expired',
			latest_invoice: null,
		}))
		await gateway.cancelAndRefund('sub_2')
		expect(sent(requests)).toStrictEqual(['GET /v1/subscriptions/sub_2'])
	})

	it('fails on a refund Stripe refuses', async () => {
		const { gateway } = gatewayOn(({ path }) => {
			switch (path) {
				case '/v1/subscriptions/sub_2':
					return { id: 'sub_2', status: 'canceled', latest_invoice: 'in_2' }
				case '/v1/invoice_payments':
					return stripeList([invoicePayment({ payment_intent: 'pi_2' })])
				default:
					return stripeError(400, {
						type: 'invalid_request_error',
						code: 'amount_too_large',
					})
			}
		})
		await expect(gateway.cancelAndRefund('sub_2')).rejects.toThrow('Refused.')
	})

	it('answers Missing for a subscription Stripe does not hold', async () => {
		const { gateway } = gatewayOn(() =>
			stripeError(404, {
				type: 'invalid_request_error',
				code: 'resource_missing',
			}),
		)
		await expect(gateway.cancelAndRefund('sub_9')).rejects.toBeInstanceOf(
			Missing,
		)
	})
})

const event = (created: number, object: object) => ({
	id: `evt_${String(created)}`,
	object: 'event',
	type: 'any',
	created,
	data: { object },
})

describe('changedSince', () => {
	it('lists each customer once, at its last event', async () => {
		const since = new Date('2026-11-01T00:00:00Z')
		const at = since.getTime() / 1000
		const { gateway, requests } = gatewayOn(({ path }) => {
			switch (path) {
				case '/v1/events':
					return stripeList([
						event(at + 50, { object: 'customer', id: 'cus_1' }),
						event(at + 40, { object: 'invoice', customer: 'cus_1' }),
						event(at + 30, {
							object: 'subscription',
							customer: { id: 'cus_2', object: 'customer' },
						}),
						// Stripe lists by time, not exactly: a page may hold a later one.
						event(at + 35, { object: 'charge', customer: 'cus_2' }),
						event(at + 20, { object: 'dispute', id: 'dp_1', charge: 'ch_3' }),
						event(at + 10, { object: 'product', id: 'prod_1' }),
						event(at + 5, { object: 'dispute', id: 'dp_2', charge: null }),
					])
				case '/v1/disputes/dp_1':
					return { id: 'dp_1', charge: 'ch_3' }
				case '/v1/disputes/dp_2':
					return { id: 'dp_2', charge: null }
				default:
					return { id: 'ch_3', customer: 'cus_3' }
			}
		})
		const changed = await gateway.changedSince(since)
		expect(Object.fromEntries(changed)).toStrictEqual({
			cus_1: new Date((at + 50) * 1000),
			cus_2: new Date((at + 35) * 1000),
			cus_3: new Date((at + 20) * 1000),
		})
		expect(requests[0]?.params).toMatchObject({
			'created[gt]': String(at),
			limit: '100',
		})
	})
})

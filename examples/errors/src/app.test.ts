// The errors a caller meets, from server code and over each transport, each
// test on a new in-memory database holding one product.
import { testApplication } from '@ultimabase/testing'
import { PublicError, master } from 'ultimabase'
import { beforeEach, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { app } from './app.ts'
import { order } from './functions.ts'
import { Product } from './models.ts'

const running = testApplication(app)

beforeEach(async () => {
	await Product.create(
		{ data: { sku: 'MUG-1', name: 'Mug', stock: 2 } },
		{ as: master },
	)
})

const post = async (path: string, body: unknown) =>
	fetch(`${running.url}${path}`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body),
	})

it('throws a PublicError to server code', async () => {
	//#region catch
	// A caller branches on the code, and lets any other error go on.
	const outcome = await order.run({ sku: 'MUG-1', quantity: 5 }).then(
		() => 'Ordered.',
		(error: unknown) => {
			if (error instanceof PublicError && error.code === 'OUT_OF_STOCK') {
				return `Sorry: ${error.message}`
			}
			throw error
		},
	)
	expect(outcome).toBe('Sorry: Only 2 left.')
	await expect(order.run({ sku: 'MUG-1', quantity: 5 })).rejects.toMatchObject({
		code: 'OUT_OF_STOCK',
		details: { sku: 'MUG-1', left: 2 },
	})

	// The kernel's own errors are PublicErrors too.
	await expect(
		Product.create(
			{ data: { sku: 'MUG-1', name: 'Other mug' } },
			{ as: master },
		),
	).rejects.toMatchObject({
		code: 'UNIQUE_VIOLATION',
		details: { model: 'Product', fields: ['sku'] },
	})
	//#endregion
})

it('sends a PublicError over REST and GraphQL', async () => {
	//#region rest
	const response = await post('/api/functions/order', {
		sku: 'MUG-1',
		quantity: 5,
	})
	// An application's own code is a 400.
	expect(response.status).toBe(400)
	expect(await response.json()).toEqual({
		code: 'OUT_OF_STOCK',
		message: 'Only 2 left.',
		details: { sku: 'MUG-1', left: 2 },
	})
	//#endregion

	//#region graphql
	const answer = await post('/graphql', {
		query: 'mutation { order(sku: "MUG-1", quantity: 5) }',
	})
	expect(await answer.json()).toMatchObject({
		data: null,
		errors: [
			{
				message: 'Only 2 left.',
				path: ['order'],
				extensions: {
					code: 'OUT_OF_STOCK',
					details: { sku: 'MUG-1', left: 2 },
				},
			},
		],
	})
	//#endregion
})

it('masks any other error, and logs it', async () => {
	//#region masked
	const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
	const response = await post('/api/functions/subscribe', {
		email: 'ada@example.com',
	})
	expect(response.status).toBe(500)
	// The message stays on the server.
	const { correlationId } = z
		.object({
			code: z.literal('INTERNAL'),
			message: z.literal('Internal error.'),
			correlationId: z.uuid(),
		})
		.strict()
		.parse(await response.json())
	// The log line holds the same id, and the error with its stack.
	const line = String(logged.mock.calls[0]?.[0])
	expect(line).toContain(correlationId)
	expect(line).toContain('NEWSLETTER_URL is not set.')
	//#endregion
})

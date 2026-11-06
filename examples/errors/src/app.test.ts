// The errors a caller meets, from server code and over each transport, each
// test on a new in-memory database holding one product.
import { testApplication } from '@ultimabase/testing'
import { InvalidQuery, PublicError, master } from 'ultimabase'
import { beforeEach, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { requestFiles } from '../../../scripts/requests.ts'
import { app } from './app.ts'
import { order } from './functions.ts'
import { messageOf } from './messages.ts'
import { Product } from './models.ts'

const running = testApplication(app)
const { check } = requestFiles(new URL('requests/', import.meta.url), running)

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
	//#endregion
	//#region details
	await expect(order.run({ sku: 'MUG-1', quantity: 5 })).rejects.toMatchObject({
		code: 'OUT_OF_STOCK',
		details: { sku: 'MUG-1', left: 2 },
	})
	//#endregion
})

it("throws the kernel's own errors as PublicErrors", async () => {
	//#region kernel
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
	//#region invalid-query
	await expect(
		// @ts-expect-error `titel` is no field: the types refuse it too.
		Product.findMany({ where: { titel: 'Mug' } }, { as: master }),
	).rejects.toThrow(InvalidQuery)
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
})

it('sends the same error over each transport, as files', async () => {
	// An application's own code is a 400.
	await check('order-rest', {}, { status: 400 })
	await check('order-graphql')
})

it('masks any other error, and logs it', async () => {
	const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
	// The message stays on the server: the response says `INTERNAL`.
	const body = await check('subscribe', {}, { status: 500 })
	const { correlationId } = z.object({ correlationId: z.uuid() }).parse(body)
	//#region logged
	// The log line holds the same id, and the error with its stack.
	const line = String(logged.mock.calls[0]?.[0])
	expect(line).toContain(correlationId)
	expect(line).toContain('NEWSLETTER_URL is not set.')
	//#endregion
})

it('shows a message for each code a client receives', async () => {
	const body = await check('order-rest', {}, { status: 400 })
	const { code } = z.object({ code: z.string() }).parse(body)
	//#region shown
	// `code` is the one of the REST answer above: OUT_OF_STOCK.
	expect(messageOf(code)).toBe('This product is out of stock.')
	expect(messageOf('A_CODE_NO_SERVER_SENDS')).toBe('Something went wrong.')
	//#endregion
})

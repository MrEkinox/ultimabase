import { testApplication } from '@ultimabase/testing'
import { afterEach, expect, it, vi } from 'vitest'

import { App } from '../src/app.ts'
import { Author, Book } from '../src/catalog.ts'
import { Customer } from '../src/customers.ts'
import { Order } from '../src/orders.ts'
import { ultimabase } from '../src/ultimabase.ts'
import { createCustomer } from './fixtures.ts'

// Each `//#region` below is shown on the Application documentation page; the
// assertions after it prove what the page says about the result.

afterEach(() => {
	vi.useRealTimers()
	vi.restoreAllMocks()
})

it('is started and healthy once testApplication has started it', async () => {
	// The first test of the file starts the application and logs its summary.
	const info = vi.spyOn(console, 'info')
	await testApplication(ultimabase)
	expect(info).toHaveBeenCalledWith(
		"UltimaBase started: 4 schemas, 1 plugin (@ultimabase/postgres-plugin); no critical privileges. Use logLevel 'debug' for the privilege report.",
	)
	//#region health
	const state = ultimabase.state
	const health = await ultimabase.health()
	//#endregion health

	expect(state).toBe('started')
	expect(health).toBe('OK')
})

it('generates calendar values in the application timezone', async () => {
	await testApplication(ultimabase)
	const customer = await createCustomer()
	// 23:30 in UTC is already the next day in Paris (UTC+2 in summer).
	vi.useFakeTimers({ toFake: ['Date'] })
	vi.setSystemTime(new Date('2026-07-31T23:30:00.000Z'))

	const order = await Order.createOne({
		data: { customer: { connect: customer.id }, total: '12.00' },
		select: { placedAt: true, placedOn: true },
	})

	expect(order.placedOn).toBe('2026-08-01')
	expect(Date.parse(order.placedAt)).toBe(
		Date.parse('2026-07-31T23:30:00.000Z'),
	)
})

it('lets only one application initialize in a realm', async () => {
	await testApplication(ultimabase)
	const second = new App({ schemas: [Author, Book, Customer, Order] })

	await expect(second.start()).rejects.toThrow(
		/Another UltimaBase application is active/u,
	)
	expect(ultimabase.state).toBe('started')
	await second.dispose()
})

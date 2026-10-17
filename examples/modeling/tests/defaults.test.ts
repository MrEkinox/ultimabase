import { testApplication } from '@ultimabase/testing'
import { expect, it } from 'vitest'

import { Customer } from '../src/customers.ts'
import { Order } from '../src/orders.ts'
import { ultimabase } from '../src/ultimabase.ts'
import { createCustomer } from './fixtures.ts'

// Each `//#region` below is shown on the Defaults and Nullability page; the
// assertions after it prove what the page says about the result.

it('completes an order created with its required input only', async () => {
	await testApplication(ultimabase)
	const customer = await createCustomer()

	//#region required-input
	const order = await Order.createOne({
		data: { customer: { connect: customer.id }, total: '24.90' },
		select: {},
	})
	//#endregion required-input

	expect(order).toMatchObject({
		coupon: 'WELCOME',
		giftWrap: false,
		note: null,
		pickupTime: null,
		status: 'pending',
		total: '24.90',
	})
	expect(order.number).toBe(1n)
	expect(order.reference).toMatch(/^[\da-f]{8}-[\da-f]{4}-4/u)
	expect(order.placedAt).toEqual(expect.any(String))
	expect(order.placedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/u)
	expect(order.createdAt).toBe(order.updatedAt)

	// The database numbers the next order; the factory runs once per order.
	const next = await Order.createOne({
		data: { customer: { connect: customer.id }, total: '5.00' },
		select: { number: true, reference: true },
	})
	expect(next.number).toBe(2n)
	expect(next.reference).not.toBe(order.reference)
})

it('keeps an explicit null apart from an omitted value', async () => {
	await testApplication(ultimabase)
	const customer = await createCustomer()

	//#region explicit-null
	const order = await Order.createOne({
		data: { customer: { connect: customer.id }, total: '24.90', coupon: null },
		select: { coupon: true },
	})
	//#endregion explicit-null

	// A default fills an omitted value only: `null` stays `null`.
	expect(order.coupon).toBeNull()
	// Without `required: false`, a defaulted field is required and rejects
	// `null`, in types and at runtime.
	await expect(
		Order.createOne({
			// @ts-expect-error -- `status` has a default and is non-null.
			data: { customer: { connect: customer.id }, total: '5', status: null },
		}),
	).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
})

it('leaves omitted fields unchanged on update and clears with null', async () => {
	await testApplication(ultimabase)
	const customer = await createCustomer()
	const order = await Order.createOne({
		data: { customer: { connect: customer.id }, total: '24.90', note: 'Gift' },
		select: {},
	})

	//#region update-null
	const updated = await Order.updateOne({
		where: { id: order.id },
		data: { status: 'paid', note: null },
		select: {},
	})
	//#endregion update-null

	expect(updated).toMatchObject({
		coupon: 'WELCOME',
		giftWrap: false,
		note: null,
		placedAt: order.placedAt,
		reference: order.reference,
		status: 'paid',
	})
	expect(updated?.number).toBe(order.number)
	expect(updated?.updatedAt).not.toBe(order.updatedAt)
})

it('applies the nullability rule to whole lists and objects', async () => {
	await testApplication(ultimabase)
	const customer = await createCustomer()

	const cleared = await Customer.updateOne({
		where: { id: customer.id },
		data: { favoriteGenres: null },
		select: { favoriteGenres: true, previousAddresses: true },
	})

	expect(customer.previousAddresses).toStrictEqual([])
	expect(customer.favoriteGenres).toBeNull()
	expect(cleared).toMatchObject({ favoriteGenres: null, previousAddresses: [] })
	// `previousAddresses` has a default: the whole list cannot be `null`.
	await expect(
		Customer.updateOne({
			where: { id: customer.id },
			// @ts-expect-error -- A defaulted list is non-null.
			data: { previousAddresses: null },
		}),
	).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
})

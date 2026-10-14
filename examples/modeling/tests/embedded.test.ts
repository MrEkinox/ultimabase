import { testApplication } from '@ultimabase/testing'
import { expect, it } from 'vitest'

import { Customer } from '../src/customers.ts'
import { ultimabase } from '../src/ultimabase.ts'

// Each `//#region` below is shown on the Embedded Objects documentation page;
// the assertions after it prove what the page says about the result.

it('completes embedded objects on create', async () => {
	await testApplication(ultimabase)

	//#region create-customer
	const customer = await Customer.createOne({
		data: {
			name: 'Ada',
			email: 'ada@example.com',
			shippingAddress: {
				line1: '12 Rue Exemple',
				city: 'Paris',
				countryCode: 'FR',
			},
		},
		select: { shippingAddress: true, previousAddresses: true },
	})
	//#endregion create-customer

	expect(customer).toStrictEqual({
		id: customer.id,
		previousAddresses: [],
		shippingAddress: {
			city: 'Paris',
			countryCode: 'FR',
			line1: '12 Rue Exemple',
			line2: null,
		},
	})
})

it('replaces an object and a whole list', async () => {
	await testApplication(ultimabase)
	const customer = await Customer.createOne({
		data: {
			email: 'ada@example.com',
			name: 'Ada',
			previousAddresses: [
				{ city: 'Nice', countryCode: 'FR', line1: '3 Rue Exemple' },
				{ city: 'Lille', countryCode: 'FR', line1: '5 Rue Exemple' },
			],
			shippingAddress: {
				city: 'Paris',
				countryCode: 'FR',
				line1: '12 Rue Exemple',
			},
		},
	})

	//#region update-addresses
	const updated = await Customer.updateOne({
		where: { id: customer.id },
		data: {
			shippingAddress: {
				line1: '8 Rue Exemple',
				line2: 'Suite 2',
				city: 'Lyon',
				countryCode: 'FR',
			},
			previousAddresses: [
				{ line1: '12 Rue Exemple', city: 'Paris', countryCode: 'FR' },
			],
		},
		select: { shippingAddress: true, previousAddresses: true },
	})
	//#endregion update-addresses

	expect(updated).toStrictEqual({
		id: customer.id,
		previousAddresses: [
			{
				city: 'Paris',
				countryCode: 'FR',
				line1: '12 Rue Exemple',
				line2: null,
			},
		],
		shippingAddress: {
			city: 'Lyon',
			countryCode: 'FR',
			line1: '8 Rue Exemple',
			line2: 'Suite 2',
		},
	})
	// The earlier result is a separate snapshot.
	expect(customer.shippingAddress.line2).toBeNull()
	expect(customer.previousAddresses).toHaveLength(2)
})

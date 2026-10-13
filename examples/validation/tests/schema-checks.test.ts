import { testApplication } from '@ultimabase/testing'
import { expect, it } from 'vitest'

import { TicketTier } from '../src/schema.ts'
import { ultimabase } from '../src/ultimabase.ts'

it('runs a Standard Schema object validator on the complete item', async () => {
	await testApplication(ultimabase)
	//#region ticket-tier-check
	const tier = await TicketTier.createOne({
		data: { name: 'Group', minPerOrder: 5, maxPerOrder: 10 },
	})
	const inverted = TicketTier.createOne({
		data: { name: 'Inverted', minPerOrder: 5, maxPerOrder: 2 },
	})
	//#endregion ticket-tier-check

	// The validator's output is not stored: the item keeps every field.
	expect(tier).toMatchObject({ maxPerOrder: 10, minPerOrder: 5, name: 'Group' })
	await expect(inverted).rejects.toMatchObject({
		code: 'VALIDATION_ERROR',
		publicDetails: {
			issues: [
				{
					code: 'schema.validation',
					message: 'The maximum cannot be below the minimum',
					path: ['maxPerOrder'],
				},
			],
		},
	})
	expect(await TicketTier.count()).toBe(1)
})

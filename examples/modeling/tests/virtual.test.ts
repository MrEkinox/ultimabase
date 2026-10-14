import { testApplication } from '@ultimabase/testing'
import { afterEach, expect, it, vi } from 'vitest'

import { Author } from '../src/catalog.ts'
import { Customer } from '../src/customers.ts'
import { loyaltyService } from '../src/loyalty.ts'
import { ultimabase } from '../src/ultimabase.ts'
import { createAuthor, createCustomer } from './fixtures.ts'

// Each `//#region` below is shown on the Virtual Fields documentation page;
// the assertions after it prove what the page says about the result.

afterEach(() => {
	vi.restoreAllMocks()
})

it('returns a virtual field without its private dependencies', async () => {
	await testApplication(ultimabase)
	const { id } = await createAuthor('Ada', 'Lovelace')

	//#region select-virtual
	const author = await Author.findOneOrThrow({
		where: { id: { eq: id } },
		select: { displayName: true },
	})
	//#endregion select-virtual

	expect(author).toStrictEqual({ displayName: 'Ada Lovelace', id })
	// Without `select`, the result holds every visible field, virtual included.
	expect(
		await Author.findOneOrThrow({ where: { id: { eq: id } } }),
	).toMatchObject({
		displayName: 'Ada Lovelace',
		firstName: 'Ada',
	})
	await expect(
		Author.findOneOrThrow({
			where: { id: { eq: '0190b7f0-0000-7000-8000-000000000000' } },
			select: { displayName: true },
		}),
	).rejects.toMatchObject({ code: 'NOT_FOUND' })
})

it('resolves every row of one read in one call', async () => {
	await testApplication(ultimabase)
	await createCustomer('Ada', 'ada@example.org')
	await createCustomer('Grace', 'grace@example.com')
	await createCustomer('Hedy', 'hedy@example.com')
	const tiers = vi.spyOn(loyaltyService, 'tiers')

	//#region resolve-many
	const customers = await Customer.findMany({
		select: { name: true, loyaltyTier: true },
		orderBy: { name: 'asc' },
	})
	//#endregion resolve-many

	expect(
		customers.map(({ loyaltyTier, name }) => [name, loyaltyTier]),
	).toStrictEqual([
		['Ada', 'gold'],
		['Grace', 'standard'],
		['Hedy', 'standard'],
	])
	expect(tiers).toHaveBeenCalledTimes(1)

	// Excluding the virtual field skips its resolver.
	const plain = await Customer.findMany({ select: { loyaltyTier: false } })
	expect(plain).toHaveLength(3)
	expect(plain[0]).not.toHaveProperty('loyaltyTier')
	expect(tiers).toHaveBeenCalledTimes(1)
})

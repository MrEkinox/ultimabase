import { testApplication } from '@ultimabase/testing'
import { expect, it } from 'vitest'

import { Profile } from '../src/schema.ts'
import { ultimabase } from '../src/ultimabase.ts'

const denied = { code: 'PERMISSION_DENIED' }

it('shows the email but refuses to filter or sort by it', async () => {
	await testApplication(ultimabase)
	await Profile.createOne({ data: { email: 'ada@example.com' } })

	expect(await Profile.findMany({ select: { email: true } })).toMatchObject([
		{ email: 'ada@example.com' },
	])
	await expect(
		Profile.findMany({ where: { email: { eq: 'ada@example.com' } } }),
	).rejects.toMatchObject(denied)
	await expect(
		Profile.findMany({ orderBy: { email: 'asc' } }),
	).rejects.toMatchObject(denied)
	// `output` was omitted, so it restricts nothing; `bio` has no rule at all.
	expect(await Profile.findMany({ where: { bio: { eq: null } } })).toHaveLength(
		1,
	)
})

it('sets a handle once and then keeps it', async () => {
	await testApplication(ultimabase)
	const profile = await Profile.createOne({
		data: { email: 'ada@example.com' },
	})

	//#region set-handle
	// Filling an empty handle is allowed: `fill` was omitted.
	const named = await Profile.updateOne({
		data: { handle: 'ada' },
		where: { id: profile.id },
	})
	//#endregion set-handle

	// A write returns `{ id }` unless it selects more.
	expect(named).toStrictEqual({ id: profile.id })
	expect(
		await Profile.findOneOrThrow({
			where: { id: { eq: profile.id } },
			select: { handle: true },
		}),
	).toMatchObject({ handle: 'ada' })
	// Replacing or clearing it is refused.
	await expect(
		Profile.updateOne({
			data: { handle: 'lovelace' },
			where: { id: profile.id },
		}),
	).rejects.toMatchObject(denied)
	await expect(
		Profile.updateOne({ data: { handle: null }, where: { id: profile.id } }),
	).rejects.toMatchObject(denied)
	// Other fields of the same row stay writable.
	expect(
		await Profile.updateOne({
			data: { bio: 'Analyst' },
			where: { id: profile.id },
			select: { bio: true, handle: true },
		}),
	).toMatchObject({ bio: 'Analyst', handle: 'ada' })
})

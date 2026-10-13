import { ACL } from '@ultimabase/acl-permissions-plugin'
import { testApplication } from '@ultimabase/testing'
import { expect, it } from 'vitest'

import { Member, Page } from '../src/schema.ts'
import { ultimabase } from '../src/ultimabase.ts'

it('recomputes the ACL from the page data', async () => {
	await using t = await testApplication(ultimabase)
	const [author, reader] = await t.asMaster(() =>
		Member.createMany({ data: [{ name: 'Ada' }, { name: 'Grace' }] }),
	)
	if (!author || !reader) throw new TypeError('Missing members')
	const asAuthor = Member.pointer(author.id)
	const asReader = Member.pointer(reader.id)

	//#region publish-page
	const page = await t.as(asAuthor, () =>
		Page.createOne({ data: { title: 'Onboarding' } }),
	)
	await t.as(asAuthor, () =>
		Page.updateOne({ data: { published: true }, where: { id: page.id } }),
	)
	const forMembers = await t.as(asReader, () => Page.findMany())
	const forAnonymous = await Page.findMany()
	//#endregion publish-page

	// `grantAuthenticated` applies to every request with a principal only.
	expect(forMembers).toMatchObject([{ id: page.id, published: true }])
	expect(forAnonymous).toStrictEqual([])
	// Unpublishing recomputes the ACL again: the reader loses the page.
	await t.as(asAuthor, () =>
		Page.updateOne({ data: { published: false }, where: { id: page.id } }),
	)
	expect(await t.as(asReader, () => Page.findMany())).toStrictEqual([])
	expect(await t.as(asAuthor, () => Page.count())).toBe(1)
})

it('writes a Master ACL as is and recomputes each updateMany item', async () => {
	await using t = await testApplication(ultimabase)
	const [author, reader] = await t.asMaster(() =>
		Member.createMany({ data: [{ name: 'Ada' }, { name: 'Grace' }] }),
	)
	if (!author || !reader) throw new TypeError('Missing members')
	const asAuthor = Member.pointer(author.id)
	const storedACL = async (id: string) =>
		(
			await t.asMaster(() =>
				Page.findOneOrThrow({ where: { id }, select: { acl: true } }),
			)
		).acl.toJSON()

	// `resolveInput` would grant authenticated reads to a published page;
	// an explicit Master ACL skips it, in createOne and in updateMany items.
	const handbook = await t.asMaster(() =>
		Page.createOne({
			data: { published: true, title: 'Handbook', acl: new ACL(asAuthor) },
		}),
	)
	expect(await storedACL(handbook.id)).toStrictEqual(new ACL(asAuthor).toJSON())
	const draft = await t.as(asAuthor, () =>
		Page.createOne({ data: { title: 'Draft' } }),
	)
	await t.asMaster(() =>
		Page.updateMany({
			data: [
				{
					where: { id: handbook.id },
					data: { acl: new ACL(asAuthor).grantPublic('read') },
				},
			],
		}),
	)
	expect(await storedACL(handbook.id)).toStrictEqual(
		new ACL(asAuthor).grantPublic('read').toJSON(),
	)

	// An updateMany item without an ACL is recomputed like an updateOne.
	await t.as(asAuthor, () =>
		Page.updateMany({
			data: [{ where: { id: draft.id }, data: { published: true } }],
		}),
	)
	expect(
		await t.as(Member.pointer(reader.id), () =>
			Page.findMany({ orderBy: { title: 'asc' }, select: { title: true } }),
		),
	).toStrictEqual([
		{ id: draft.id, title: 'Draft' },
		{ id: handbook.id, title: 'Handbook' },
	])
})

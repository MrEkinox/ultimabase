import { testApplication } from '@ultimabase/testing'
import { expect, it } from 'vitest'

import { Member, Post } from '../src/schema.ts'
import { addStaffMember, includeAdministratorsInEditors } from '../src/staff.ts'
import { ultimabase } from '../src/ultimabase.ts'

const denied = { code: 'PERMISSION_DENIED' }

it('lets editors write posts and administrators delete them', async () => {
	await using t = await testApplication(ultimabase)
	const [ada, grace, linus] = await t.asMaster(() =>
		Member.createMany({
			data: [{ name: 'Ada' }, { name: 'Grace' }, { name: 'Linus' }],
		}),
	)
	if (!ada || !grace || !linus) throw new TypeError('Missing members')
	await includeAdministratorsInEditors()
	await addStaffMember('editor', ada.id)
	await addStaffMember('administrator', grace.id)
	// Master holds no role, yet bypasses Access as an authority.
	const post = await t.asMaster(() =>
		Post.createOne({ data: { title: 'Launch' } }),
	)

	//#region edit-post
	const edited = await t.as(Member.pointer(ada.id), () =>
		Post.updateOne({ where: { id: post.id }, data: { title: 'Launch day' } }),
	)
	//#endregion edit-post

	expect(edited).toMatchObject({ title: 'Launch day' })
	// A member without the role, and an anonymous caller, are refused.
	await expect(
		t.as(Member.pointer(linus.id), () =>
			Post.updateOne({ where: { id: post.id }, data: { title: 'Mine' } }),
		),
	).rejects.toMatchObject(denied)
	await expect(
		Post.updateOne({ where: { id: post.id }, data: { title: 'Mine' } }),
	).rejects.toMatchObject(denied)
	// Deleting needs Administrator: Ada is only an editor.
	await expect(
		t.as(Member.pointer(ada.id), () =>
			Post.deleteOne({ where: { id: post.id } }),
		),
	).rejects.toMatchObject(denied)
	// Grace is an editor through the hierarchy, and an administrator.
	const asGrace = Member.pointer(grace.id)
	expect(
		await t.as(asGrace, () =>
			Post.updateOne({ where: { id: post.id }, data: { title: 'Final' } }),
		),
	).toMatchObject({ title: 'Final' })
	expect(
		await t.as(asGrace, () => Post.deleteOne({ where: { id: post.id } })),
	).toMatchObject({ id: post.id })
})

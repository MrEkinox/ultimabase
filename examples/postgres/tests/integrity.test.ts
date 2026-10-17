import { testApplication } from '@ultimabase/testing'
import { expect, it } from 'vitest'

import { Article, Contribution, StaffMember } from '../src/schema.ts'
import { ultimabase } from '../src/ultimabase.ts'

// PostgreSQL enforces unique indexes and foreign keys; its driver errors
// become neutral Core errors in logical names.

it('reports a duplicate unique value in logical names', async () => {
	await testApplication(ultimabase)
	//#region unique-violation
	await StaffMember.createOne({
		data: { name: 'Ada', email: 'ada@example.com' },
	})

	const duplicate = StaffMember.createOne({
		data: { name: 'Ada Lovelace', email: 'ada@example.com' },
	})
	//#endregion unique-violation

	await expect(duplicate).rejects.toMatchObject({
		code: 'UNIQUE_VIOLATION',
		publicDetails: { schema: 'StaffMember', fields: ['email'] },
		publicMessage: 'A StaffMember with the same email already exists.',
	})
	expect(await StaffMember.count()).toBe(1)
})

it('enforces a composite unique index', async () => {
	await testApplication(ultimabase)
	const ada = await StaffMember.createOne({
		data: { name: 'Ada', email: 'ada@example.com' },
	})
	const article = await Article.createOne({
		data: { slug: 'launch', title: 'Launch', author: { connect: ada.id } },
	})

	await Contribution.createOne({
		data: {
			article: { connect: article.id },
			member: { connect: ada.id },
			role: 'writer',
		},
	})

	// The same member on the same article again, even with another role.
	const twice = Contribution.createOne({
		data: {
			article: { connect: article.id },
			member: { connect: ada.id },
			role: 'editor',
		},
	})

	await expect(twice).rejects.toMatchObject({
		code: 'UNIQUE_VIOLATION',
		publicDetails: { schema: 'Contribution', fields: ['article', 'member'] },
	})
})

it('restricts or cascades deletions through foreign keys', async () => {
	await testApplication(ultimabase)
	const ada = await StaffMember.createOne({
		data: { name: 'Ada', email: 'ada@example.com' },
	})
	const grace = await StaffMember.createOne({
		data: { name: 'Grace', email: 'grace@example.com' },
	})
	const article = await Article.createOne({
		data: { slug: 'launch', title: 'Launch', author: { connect: ada.id } },
	})
	await Contribution.createOne({
		data: {
			article: { connect: article.id },
			member: { connect: grace.id },
			role: 'editor',
		},
	})

	// `Contribution.member` restricts: Grace's contribution keeps her.
	const restricted = StaffMember.deleteOne({ where: { id: grace.id } })

	await expect(restricted).rejects.toMatchObject({
		code: 'REFERENCE_VIOLATION',
		publicMessage:
			'The StaffMember object cannot be deleted while other objects reference it.',
	})

	// `Article.author` cascades: deleting Ada deletes her article, and
	// `Contribution.article` cascades to its contributions.
	await StaffMember.deleteOne({ where: { id: ada.id } })

	expect(await Article.count()).toBe(0)
	expect(await Contribution.count()).toBe(0)
	// With her contribution gone, Grace can be deleted.
	expect(
		await StaffMember.deleteOne({ where: { id: grace.id } }),
	).toMatchObject({ id: grace.id })
})

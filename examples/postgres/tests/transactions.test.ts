import { testApplication } from '@ultimabase/testing'
import { expect, it } from 'vitest'

import { publishWithEditor } from '../src/newsroom.ts'
import { Article, Contribution, StaffMember } from '../src/schema.ts'
import { ultimabase } from '../src/ultimabase.ts'

const createDraft = async (slug: string) => {
	const ada = await StaffMember.createOne({
		data: { name: 'Ada', email: `ada-${slug}@example.com` },
	})
	return Article.createOne({
		data: { slug, title: 'Draft', author: { connect: ada.id } },
	})
}

it('runs each mutation in its own transaction', async () => {
	await testApplication(ultimabase)
	const ada = await StaffMember.createOne({
		data: { name: 'Ada', email: 'ada@example.com' },
	})

	// The second row repeats a unique slug: no row of the batch is kept.
	const batch = Article.createMany({
		data: [
			{ slug: 'first', title: 'First', author: { connect: ada.id } },
			{ slug: 'first', title: 'Again', author: { connect: ada.id } },
		],
	})

	await expect(batch).rejects.toMatchObject({ code: 'UNIQUE_VIOLATION' })
	expect(await Article.count()).toBe(0)
})

it('commits an explicit transaction once', async () => {
	await testApplication(ultimabase)
	const draft = await createDraft('launch')
	const grace = await StaffMember.createOne({
		data: { name: 'Grace', email: 'grace@example.com' },
	})

	const published = await publishWithEditor(draft.id, grace.id)

	expect(published).toMatchObject({ id: draft.id, status: 'published' })
	const contributions = await Contribution.findMany({
		where: { article: draft.id },
		select: { role: true },
	})
	expect(contributions.map(({ role }) => role)).toStrictEqual(['editor'])
})

it('rolls back every write of a failed transaction', async () => {
	await testApplication(ultimabase)
	const draft = await createDraft('launch')
	const grace = await StaffMember.createOne({
		data: { name: 'Grace', email: 'grace@example.com' },
	})
	await Contribution.createOne({
		data: {
			article: { connect: draft.id },
			member: { connect: grace.id },
			role: 'writer',
		},
	})

	// Grace already contributed: the second write fails, so the status
	// update made before it in the same transaction is rolled back too.
	const failure = publishWithEditor(draft.id, grace.id)

	await expect(failure).rejects.toMatchObject({ code: 'UNIQUE_VIOLATION' })
	expect(
		await Article.findOneOrThrow({
			where: { id: draft.id },
			select: { status: true, publishedAt: true },
		}),
	).toStrictEqual({ id: draft.id, status: 'draft', publishedAt: null })
})

it('refuses a nested explicit transaction', async () => {
	await testApplication(ultimabase)

	const nested = ultimabase.transaction(() =>
		ultimabase.transaction(() => Article.count()),
	)

	await expect(nested).rejects.toMatchObject({ code: 'TRANSACTION_ERROR' })
})

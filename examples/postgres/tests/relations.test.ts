import { testApplication } from '@ultimabase/testing'
import { expect, it } from 'vitest'

import { Article, StaffMember, Tag } from '../src/schema.ts'
import { ultimabase } from '../src/ultimabase.ts'

// Pointers are uuid columns with foreign keys; relations are hidden join
// tables. Reads load both through one relational query, never a query per row.

const createTags = (...labels: string[]) =>
	Tag.createMany({ data: labels.map((label) => ({ label })) })

it('stores a pointer and filters through its target', async () => {
	await testApplication(ultimabase)
	const ada = await StaffMember.createOne({
		data: { name: 'Ada', email: 'ada@example.com' },
	})
	const grace = await StaffMember.createOne({
		data: { name: 'Grace', email: 'grace@example.com' },
	})

	const engines = await Article.createOne({
		data: { slug: 'engines', title: 'Engines', author: { connect: ada.id } },
	})

	const found = await Article.findOne({
		where: { author: { is: { name: { startsWith: 'A' } } } },
		select: { title: true },
		include: { author: { select: { name: true } } },
	})

	expect(found).toStrictEqual({
		author: { id: ada.id, name: 'Ada' },
		id: engines.id,
		title: 'Engines',
	})
	expect(await Article.count({ where: { author: { eq: grace.id } } })).toBe(0)
})

it('connects, reads and replaces relation members', async () => {
	await testApplication(ultimabase)
	const ada = await StaffMember.createOne({
		data: { name: 'Ada', email: 'ada@example.com' },
	})
	const article = await Article.createOne({
		data: { slug: 'tags', title: 'Tags', author: { connect: ada.id } },
	})
	const [postgres, typescript, featured] = await createTags(
		'postgres',
		'typescript',
		'featured',
	)
	if (!postgres || !typescript || !featured) throw new TypeError('No tags')

	await Article.updateOne({
		where: { id: article.id },
		data: { tags: { connect: [postgres.id, typescript.id] } },
	})

	const { tags } = await Article.findOneOrThrow({
		where: { id: article.id },
		select: { id: true },
		include: {
			tags: { select: { label: true }, orderBy: { label: 'asc' }, take: 20 },
		},
	})

	// `set` replaces the members; `set: []` removes them all.
	await Article.updateOne({
		where: { id: article.id },
		data: { tags: { set: [featured.id] } },
	})

	expect(tags.map(({ label }) => label)).toStrictEqual([
		'postgres',
		'typescript',
	])
	const replaced = await Article.findOneOrThrow({
		where: { id: article.id },
		include: { tags: { select: { label: true } } },
	})
	expect(replaced.tags.map(({ label }) => label)).toStrictEqual(['featured'])
	// Deleting a tag removes its join rows, never the article.
	await Tag.deleteOne({ where: { id: featured.id } })
	expect(await Article.count({ where: { tags: { isEmpty: true } } })).toBe(1)
})

it('filters on relation members without loading them', async () => {
	await testApplication(ultimabase)
	const ada = await StaffMember.createOne({
		data: { name: 'Ada', email: 'ada@example.com' },
	})
	const [postgres, typescript] = await createTags('postgres', 'typescript')
	if (!postgres || !typescript) throw new TypeError('No tags')
	const author = { connect: ada.id }
	await Article.createOne({
		data: {
			slug: 'both',
			title: 'Both',
			author,
			tags: { connect: [postgres.id, typescript.id] },
		},
	})
	await Article.createOne({
		data: {
			slug: 'one',
			title: 'One',
			author,
			tags: { connect: [typescript.id] },
		},
	})
	await Article.createOne({ data: { slug: 'none', title: 'None', author } })

	// EXISTS: at least one member matches.
	const aboutPostgres = await Article.findMany({
		where: { tags: { some: { label: { eq: 'postgres' } } } },
		select: { slug: true },
	})

	// A correlated count of the matching members.
	const wellTagged = await Article.findMany({
		where: { tags: { count: { gte: 2 } } },
		select: { slug: true },
	})

	// `every` is also true for an empty relation.
	const onlyTypescript = await Article.findMany({
		where: { tags: { every: { label: { eq: 'typescript' } } } },
		orderBy: { slug: 'asc' },
		select: { slug: true },
	})

	expect(aboutPostgres.map(({ slug }) => slug)).toStrictEqual(['both'])
	expect(wellTagged.map(({ slug }) => slug)).toStrictEqual(['both'])
	expect(onlyTypescript.map(({ slug }) => slug)).toStrictEqual(['none', 'one'])
	expect(await Article.count({ where: { tags: { isNotEmpty: true } } })).toBe(2)
})

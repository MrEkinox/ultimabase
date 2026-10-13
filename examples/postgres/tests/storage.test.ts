import { testApplication } from '@ultimabase/testing'
import { expect, it } from 'vitest'

import { Article, StaffMember, Tag } from '../src/schema.ts'
import { ultimabase } from '../src/ultimabase.ts'
import { openWorkerCatalog } from './support.ts'

// The physical side of `src/schema.ts`, read with our own pool outside
// UltimaBase; application code never sees these names.

it('derives table and column names', async () => {
	await testApplication(ultimabase)
	await using catalog = openWorkerCatalog()

	expect(await catalog.tables()).toStrictEqual([
		'contributions',
		'newsroom_articles',
		// The hidden join table of `Article.tags`.
		expect.stringMatching(/^newsroom_articles_tags/u),
		'staff_members',
		'tags',
	])
	expect(Object.keys(await catalog.columns('staff_members'))).toStrictEqual([
		'name',
		'email',
		'id',
		'created_at',
		'updated_at',
	])
})

it('maps each field kind to a column type', async () => {
	await testApplication(ultimabase)
	await using catalog = openWorkerCatalog()

	expect(await catalog.columns('newsroom_articles')).toStrictEqual({
		id: 'uuid',
		created_at: 'timestamp(3) with time zone',
		updated_at: 'timestamp(3) with time zone',
		slug: 'text',
		title: 'text',
		status: 'text',
		word_count: 'bigint',
		rating: 'double precision',
		price: 'numeric(8,2)',
		published_at: 'timestamp(3) with time zone',
		keywords: 'jsonb',
		metadata: 'jsonb',
		author: 'uuid',
	})
})

it('reads results with the field names and application values', async () => {
	await testApplication(ultimabase)
	const ada = await StaffMember.createOne({
		data: { name: 'Ada', email: 'ada@example.com' },
	})

	//#region kinds
	const article = await Article.createOne({
		data: {
			slug: 'postgres-kinds',
			title: 'Field kinds in PostgreSQL',
			wordCount: 1200,
			rating: 4.5,
			price: '19.90',
			publishedAt: '2026-10-13T08:30:00.000Z',
			keywords: ['postgres', 'storage'],
			metadata: { visibility: 'public', featured: true },
			author: { connect: ada.id },
		},
	})
	//#endregion kinds

	expect(article).toMatchObject({
		author: { id: ada.id },
		keywords: ['postgres', 'storage'],
		metadata: { featured: true, visibility: 'public' },
		price: '19.90',
		publishedAt: '2026-10-13T08:30:00.000Z',
		rating: 4.5,
		status: 'draft',
		wordCount: 1200,
	})
})

it('compiles field, composite and partial indexes', async () => {
	await testApplication(ultimabase)
	await using catalog = openWorkerCatalog()

	const articleIndexes = await catalog.indexes('newsroom_articles')
	expect(articleIndexes).toContainEqual(
		expect.stringMatching(/^CREATE UNIQUE INDEX .* USING btree \(slug\)$/u),
	)
	expect(articleIndexes).toContainEqual(
		expect.stringMatching(/USING btree \(author, created_at\)$/u),
	)
	expect(articleIndexes).toContainEqual(
		expect.stringMatching(
			/USING btree \(published_at\) WHERE \(status = 'published'::text\)$/u,
		),
	)
	expect(await catalog.indexes('contributions')).toContainEqual(
		expect.stringMatching(
			/^CREATE UNIQUE INDEX .* USING btree \(article, member\)$/u,
		),
	)
	expect(await Tag.count()).toBe(0)
})

it('answers health checks with a query on its pool', async () => {
	await testApplication(ultimabase)

	//#region health
	const health = await ultimabase.health()
	//#endregion health

	expect(health).toBe('OK')
})

import path from 'node:path'

import * as ts from 'typescript'
import { afterAll, describe, expect, it } from 'vitest'
import {
	createGeneratedRegistry,
	createSourceLanguageServiceWorkspace,
} from '../tests/fixtures/generator-language-service.js'

const selectMarker = '/* generated-select */'
const hoverMarker = '/* generated-hover */'
const targetMarker = '/* generated-target */'
const registry = createGeneratedRegistry()
const workspace = createSourceLanguageServiceWorkspace()

const service = workspace.service
afterAll(() => {
	service.dispose()
})

describe('generated application TypeScript contracts', () => {
	it('typechecks exact models, operations, relationships, and plugin methods', () => {
		const sourceWithMarkers = `${registry}
declare const author: Core.PointerValue
declare const item: SemanticArticleItem
declare const field: Core.FieldBuilder

const createInput: SemanticArticleCreateInput = {
  author,
  status: 'draft',
  title: 'Generated contracts',
}
const updateInput: SemanticArticleUpdateInput = {
  profile: { displayName: 'Updated' },
  status: 'published',
}
const where: ${hoverMarker}SemanticArticleWhereInput = {
  author: { is: { name: { startsWith: 'Ada' } } },
  profile: { at: [{ path: ['displayName'], startsWith: 'A' }] },
  related: { count: { gte: 3, where: { status: { eq: 'published' } } } },
  scores: {
    eq: [10, 20],
    has: 10,
    hasEvery: [10, 20],
    hasSome: [30],
    isEmpty: true,
  },
  statuses: { has: 'published' },
  profiles: { has: { displayName: 'Ada' } },
  embeddings: { has: [0, 1, 0] },
  status: { in: ['draft', 'published'] },
}
const selection: SemanticArticleSelect = { ${selectMarker} }
const order: SemanticArticleOrderByInput = {
  status: 'asc',
  title: 'desc',
}
const include: SemanticArticleInclude = {
  author: { select: { id: true, name: true } },
  related: {
    take: 5,
    skip: 2,
    orderBy: { title: 'asc' },
    select: { id: true, title: true },
    where: { status: { eq: 'draft' } },
  },
}
const exactStatus: 'draft' | 'published' = item.status
const exactVector: readonly number[] | null = item.embedding
const pointerId: string = item.author.id
// @ts-expect-error -- Pointers no longer read their target (ADR-0310).
item.author.findOne
const schemaItem: Schemas.SemanticArticle['item'] = item
const schemaCreate: Schemas.SemanticArticle['inputs']['create'] = createInput

field.vector({ dimensions: 3 })
field.pointer({ target: 'SemanticAuthor' })
field.relation({ target: 'SemanticArticle' })
// @ts-expect-error -- The incomplete literal drives generated target completion.
field.pointer({ target: '${targetMarker}' })
field.pointer({
  // @ts-expect-error -- Generated registries reject unknown relationship targets.
  target: 'MissingSemanticSchema',
})

const invalidEnum: SemanticArticleCreateInput = {
  author,
  // @ts-expect-error -- Generated enums retain their exact literals.
  status: 'archived',
  title: 'Invalid',
}
const invalidUpdate: SemanticArticleUpdateInput = {
  // @ts-expect-error -- Framework-generated identifiers cannot be updated.
  id: 'forbidden',
}
const invalidSelection: SemanticArticleSelect = {
  // @ts-expect-error -- Selection exposes only exact schema field names.
  missing: true,
}
const invalidOrder: SemanticArticleOrderByInput = {
  // @ts-expect-error -- Generated ordering exposes only exact field names.
  missing: 'asc',
}
const invalidListFilter: SemanticArticleWhereInput = {
  scores: {
    // @ts-expect-error -- Generated array filters retain their exact element type.
    has: '10',
  },
}

void createInput
void [exactStatus, exactVector]
void include
void invalidEnum
void invalidOrder
void invalidListFilter
void invalidSelection
void invalidUpdate
void order
void pointerId
void selection
void updateInput
`
		const selectPosition = sourceWithMarkers.indexOf(selectMarker)
		const hoverPosition = sourceWithMarkers.indexOf(hoverMarker)
		const targetPosition = sourceWithMarkers.indexOf(targetMarker)
		const source = sourceWithMarkers
			.replace(selectMarker, ' '.repeat(selectMarker.length))
			.replace(hoverMarker, ' '.repeat(hoverMarker.length))
			.replace(targetMarker, ' '.repeat(targetMarker.length))
		const fileName = path.join(
			import.meta.dirname,
			'generated-application.semantic.fixture.ts',
		)
		workspace.addFile(fileName, source)

		expect(registry).not.toMatch(/\bany\b/u)
		expect(
			service
				.getSemanticDiagnostics(fileName)
				.map(({ messageText }) =>
					ts.flattenDiagnosticMessageText(messageText, '\n'),
				),
		).toStrictEqual([])
		expect(
			service
				.getCompletionsAtPosition(fileName, selectPosition, {})
				?.entries.map(({ name }) => name),
		).toEqual(
			expect.arrayContaining([
				'author',
				'embedding',
				'profile',
				'status',
				'title',
			]),
		)
		expect(
			service
				.getCompletionsAtPosition(fileName, targetPosition, {})
				?.entries.map(({ name }) => name),
		).toEqual(expect.arrayContaining(['SemanticArticle', 'SemanticAuthor']))

		const hover = service.getQuickInfoAtPosition(
			fileName,
			hoverPosition + hoverMarker.length,
		)
		const display = ts.displayPartsToString(hover?.displayParts)

		expect(display).toContain('SemanticArticleWhereInput')
		// Direct recursive where types are intentionally readable in the generated
		// file while this ceiling still protects editor hovers from runaway expansion.
		expect(display.length).toBeLessThan(1_000)
	})

	it('drives the actual Core schema, Query, mutation, Access, and hook APIs', () => {
		const publicSource = `${registry}
import { accessPlugin } from '@ultimabase/access-plugin'
import { UltimaBase } from '@ultimabase/core'
import { hooksPlugin } from '@ultimabase/hooks-plugin'
import { pgVectorPlugin } from '@ultimabase/pg-vector-plugin'

const SemanticApplication = UltimaBase.use(accessPlugin())
  .use(hooksPlugin())
  .use(pgVectorPlugin())

const SemanticAuthor = SemanticApplication.Schema.define({
  className: 'SemanticAuthor',
  fields: (field) => ({
    articles: field.relation({
      target: 'SemanticArticle',
    }),
    name: field.string({ required: true }),
  }),
})

const SemanticArticle = SemanticApplication.Schema.define({
  className: 'SemanticArticle',
  fields: (field) => ({
    author: field.pointer({
      target: 'SemanticAuthor',
      required: true,
    }),
    embedding: field./* public-plugin-method */vector({ dimensions: 3 }),
    profile: field.object({
      fields: (field) => ({
        displayName: field.string({
          required: true,
          access: {
            read: {
              output: ({ value }) => value !== null && value.length > 0,
              where: true,
              orderBy: true,
            },
            write: true,
          },
          hooks: { resolveInput: ({ value }) => value?.trim() ?? null },
        }),
      }),
    }),
    related: field.relation({
      target: 'SemanticArticle',
    }),
    scores: field.int({ list: true }),
    status: field.enum({
      required: true,
      values: ['draft', 'published'],
    }),
    title: field./* public-field-method */string({ required: true }),
    views: field.int(),
  }),
  indexes: [{ fields: ['title', 'status'] }],
  access: {
    create: false,
    delete: false,
    update: {
      where: () => ({ status: { eq: 'draft' } }),
      item: ({ item, originalItem }) => {
        item./* public-access-item */embedding
        return originalItem.status === 'draft' && item.status === 'published'
      },
    },
    upsert: false,
  },
  hooks: {
    afterOperation: {
      update: ({ item }) => { void /* public-after-item-hover */item.title },
      delete: ({ item }) => { const deleted: null = item; void deleted },
    },
    beforeOperation: {
      update: ({ item, originalItem }) => {
        item./* public-hook-item */profile
        originalItem.status
      },
    },
  },
})

const createInput: SemanticArticleCreateInput = {
  author: SemanticAuthor.pointer('author-1'),
  status: 'draft',
  title: 'Generated public API',
}
// @ts-expect-error -- Schemas are not constructible (ADR-0310).
new SemanticArticle(createInput)
const exactStatus: 'draft' | 'published' = createInput.status
declare const loadedArticle: SemanticArticleItem
const authorRead = SemanticAuthor.findOne({
  /* public-pointer-where-hover */where: { /* public-pointer-where */ id: { eq: loadedArticle.author.id }, name: { startsWith: 'A' } },
  select: { /* public-pointer-handle-select */ name: true },
})
type AuthorRead = Awaited<typeof authorRead>
declare const loadedAuthor: NonNullable<AuthorRead>
const exactAuthorName: string = loadedAuthor.name
// @ts-expect-error -- The generated pointer handle exposes only Author fields.
loadedAuthor.title

const result = SemanticArticle./* public-find-many-hover */findMany({
  /* public-query-where-hover */where: { /* public-query-where */ status: { eq: 'draft' } },
  select: { /* public-query-select */ title: true, status: true },
  include: {
    author: { select: { /* public-pointer-select */ name: true } },
    related: { where: { status: { eq: 'published' } } },
  },
})
result.then((articles) => {
  const article = articles[0]
	if (article === undefined || article.author === null) return
	const id: string = article.id
	const authorId: string = article.author.id
	const relatedId: string | undefined = article.related[0]?.id
	void id
	void authorId
	void relatedId
})
const invalidIdentifierSelection: SemanticArticleSelect = {
  // @ts-expect-error -- Stable model identifiers cannot be omitted.
  id: false,
}
const invalidObjectPath: SemanticArticleWhereInput = {
  profile: {
    at: [{
      // @ts-expect-error -- Generated object occurrences retain exact paths.
      path: ['missing'],
      eq: 'invalid',
    }],
  },
}

const projectedUpdate = SemanticArticle./* public-update-one-hover */updateOne({
  where: { id: { eq: 'article-1' } },
  data: { status: 'published', views: { increment: 1 } },
  select: { title: true },
  include: { author: { select: { name: true } } },
})

SemanticArticle./* public-delete-one-hover */deleteOne({
  where: { id: { eq: 'article-1' } },
})

SemanticArticle.updateOne({
  /* public-update-where-hover */where: { id: { eq: 'article-1' } },
  data: { title: 'Canonical update' },
})
SemanticArticle.deleteOne({
  /* public-delete-where-hover */where: { id: { eq: 'article-1' } },
})

SemanticArticle./* public-count-hover */count({
  /* public-count-where-hover */where: { status: { eq: 'draft' } },
})

const projectedCreate = SemanticArticle./* public-create-one-hover */createOne({
  data: {
    author: { connect: 'author-1' },
    status: 'draft',
    title: 'Created',
  },
  select: { title: true },
  include: { author: { select: { name: true } } },
})
projectedCreate.then((article) => {
  if (article.author === null) return
	const id: string = article.id
  const title: string = article.title
	const authorId: string = article.author.id
  const authorName: string = article.author.name
  // @ts-expect-error -- Mutation selection excludes unselected scalar fields.
  article.status
	void id
  void title
	void authorId
  void authorName
})
projectedUpdate.then((article) => {
  if (article === null) return
  if (article.author === null) return
	const id: string = article.id
  const title: string = article.title
	const authorId: string = article.author.id
  const authorName: string = article.author.name
  // @ts-expect-error -- Mutation selection excludes unselected scalar fields.
  article.status
	void id
  void title
	void authorId
  void authorName
})
const projectedCreates = SemanticArticle./* public-create-many-hover */createMany({
  data: [{
    author: SemanticAuthor.pointer('author-1'),
    status: 'draft',
    title: 'Created',
  }],
  select: { title: true },
  include: { author: { select: { name: true } } },
})
SemanticArticle./* public-find-one-hover */findOne({
  where: { status: { eq: 'draft' } },
})
SemanticArticle./* public-find-one-or-throw-hover */findOneOrThrow({ where: { id: { eq: 'article-1' } } })
SemanticArticle./* public-exists-hover */exists({
  where: { status: { eq: 'draft' } },
})
const projectedUpdates = SemanticArticle./* public-update-many-hover */updateMany({
  data: [{
    where: { id: { eq: 'article-1' } },
    data: { status: 'published' },
  }],
  include: { author: { select: { name: true } } },
})
projectedCreates.then((articles) => {
  const article = articles[0]
  if (article === undefined || article.author === null) return
	const id: string = article.id
  const title: string = article.title
	const authorId: string = article.author.id
  const authorName: string = article.author.name
  // @ts-expect-error -- Common collection selection excludes other scalars.
  article.status
	void id
  void title
	void authorId
  void authorName
})
projectedUpdates.then((articles) => {
  const article = articles[0]
  if (article === undefined || article.author === null) return
  const id: string = article.id
	const authorId: string = article.author.id
  const authorName: string = article.author.name
  // @ts-expect-error -- updateMany still defaults its scalar projection to id.
  article.title
  void id
	void authorId
  void authorName
})
SemanticArticle.createOne({ data: { author: { connect: 'author-1' }, status: 'draft', title: 'Created' }, /* public-create-one-options */ })
SemanticArticle.createMany({ data: [createInput], /* public-create-many-options */ })
SemanticArticle.updateOne({
  where: { id: { eq: 'article-1' } },
  data: { title: 'Completion update' },
  /* public-update-one-options */
})
// @ts-expect-error -- The incomplete target drives the singular target completion.
SemanticArticle.updateOne({
  /* public-update-one-target */
  data: { title: 'Target completion' },
})
// @ts-expect-error -- The incomplete target drives the singular target completion.
SemanticArticle.deleteOne({ /* public-delete-one-target */ })
SemanticArticle.updateMany({
  data: [{
    where: { id: { eq: 'article-1' } },
    data: { title: 'Completion update' },
  }],
  /* public-update-many-options */
})
SemanticArticle./* public-upsert-one-hover */upsertOne({
  where: { id: { eq: 'article-1' } },
  create: {
    author: SemanticAuthor.pointer('author-1'),
    status: 'draft',
    title: 'Upserted',
  },
  update: { status: 'published' },
})
SemanticArticle./* public-upsert-many-hover */upsertMany({
  data: [{
    where: { id: { eq: 'article-1' } },
    create: {
      author: SemanticAuthor.pointer('author-1'),
      status: 'draft',
      title: 'Upserted',
    },
    update: { status: 'published' },
  }],
})
SemanticArticle./* public-delete-many-hover */deleteMany({
  where: [{ id: { eq: 'article-1' } }],
})

SemanticArticle.updateOne({
  where: { id: { eq: 'article-1' } },
  // @ts-expect-error -- Generated numeric lists cannot use scalar increments.
  data: { scores: { increment: 1 } },
})

SemanticArticle.updateOne({
  // @ts-expect-error -- The top-level id alias was removed (ADR-0307).
  id: 'article-1',
  data: { title: 'Invalid target' },
})
SemanticArticle.deleteOne({
  // @ts-expect-error -- The top-level id alias was removed (ADR-0307).
  id: 'article-1',
})

type LoadedArticle = NonNullable<Awaited<ReturnType<typeof SemanticArticle.findOne>>>
declare const persistedArticle: LoadedArticle
const relatedRead = SemanticArticle.findOne({
  where: { id: { eq: persistedArticle.id } },
  include: {
    related: {
      /* public-relation-where-hover */where: { /* public-relation-where */ status: { eq: 'published' } },
      select: { title: true },
    },
  },
})
// @ts-expect-error -- Results have no relation handles (ADR-0310).
persistedArticle.relation
SemanticArticle.updateOne({
  where: { id: { eq: persistedArticle.id } },
  data: { related: { connect: ['article-2'] } },
})

void exactStatus
void exactAuthorName
void authorRead
void result
void invalidIdentifierSelection
void invalidObjectPath
void relatedRead
`
		const fileName = path.join(
			import.meta.dirname,
			'generated-core-public-api.semantic.fixture.ts',
		)
		workspace.addFile(fileName, publicSource)

		expect(
			service
				.getSemanticDiagnostics(fileName)
				.map(({ messageText }) =>
					ts.flattenDiagnosticMessageText(messageText, '\n'),
				),
		).toStrictEqual([])

		const completionNames = (marker: string): readonly string[] =>
			service
				.getCompletionsAtPosition(
					fileName,
					publicSource.indexOf(marker) + marker.length,
					{},
				)
				?.entries.map(({ name }) => name) ?? []
		const quickInfo = (marker: string): string => {
			const info = service.getQuickInfoAtPosition(
				fileName,
				publicSource.indexOf(marker) + marker.length,
			)

			return ts.displayPartsToString(info?.displayParts)
		}

		expect(completionNames('/* public-field-method */')).toEqual(
			expect.arrayContaining(['string', 'vector']),
		)
		expect(completionNames('/* public-plugin-method */')).toContain('vector')
		expect(completionNames('/* public-access-item */')).toEqual(
			expect.arrayContaining(['embedding', 'profile', 'status', 'title']),
		)
		expect(completionNames('/* public-hook-item */')).toEqual(
			expect.arrayContaining(['embedding', 'profile', 'status', 'title']),
		)
		// Callback hovers must show model fields, not just a generic result alias.
		const afterItemHover = quickInfo('/* public-after-item-hover */')
		expect(afterItemHover).toContain('readonly embedding:')
		expect(afterItemHover).toContain('readonly author:')
		expect(afterItemHover).not.toContain('(parameter) item: Core.SchemaResult<')
		expect(completionNames('/* public-query-where */')).toEqual(
			expect.arrayContaining(['AND', 'author', 'profile', 'related']),
		)
		expect(completionNames('/* public-query-select */')).toEqual(
			expect.arrayContaining(['embedding', 'profile']),
		)
		expect(completionNames('/* public-query-select */')).not.toContain(
			'related',
		)
		expect(completionNames('/* public-pointer-select */')).toEqual(
			expect.arrayContaining(['createdAt', 'id', 'updatedAt']),
		)
		expect(completionNames('/* public-pointer-where */')).toEqual(
			expect.arrayContaining(['AND', 'articles']),
		)
		expect(completionNames('/* public-pointer-handle-select */')).toEqual(
			expect.arrayContaining(['createdAt', 'id', 'updatedAt']),
		)
		expect(completionNames('/* public-relation-where */')).toEqual(
			expect.arrayContaining(['AND', 'author', 'profile', 'related']),
		)
		for (const marker of [
			'/* public-create-many-options */',
			'/* public-create-one-options */',
			'/* public-update-many-options */',
			'/* public-update-one-options */',
		]) {
			expect(completionNames(marker)).toContain('include')
		}
		for (const marker of [
			'/* public-delete-one-target */',
			'/* public-update-one-target */',
		]) {
			// ADR-0307: `where` is the only singular target.
			expect(completionNames(marker)).toContain('where')
			expect(completionNames(marker)).not.toContain('id')
		}
		expect(quickInfo('/* public-query-where-hover */')).toContain(
			'where?: SemanticArticleWhereInput',
		)
		for (const marker of [
			'/* public-count-hover */',
			'/* public-create-many-hover */',
			'/* public-create-one-hover */',
			'/* public-delete-many-hover */',
			'/* public-delete-one-hover */',
			'/* public-exists-hover */',
			'/* public-find-many-hover */',
			'/* public-find-one-hover */',
			'/* public-find-one-or-throw-hover */',
			'/* public-update-many-hover */',
			'/* public-update-one-hover */',
			'/* public-upsert-many-hover */',
			'/* public-upsert-one-hover */',
		]) {
			const hover = quickInfo(marker)

			expect(hover).toContain('SchemaAPI<Schemas.SemanticArticle>')
			expect(hover).not.toContain('GenericField')
			expect(hover).not.toContain('NonDefaulted')
		}
		expect(quickInfo('/* public-pointer-where-hover */')).toContain(
			'where?: SemanticAuthorWhereInput',
		)
		expect(quickInfo('/* public-relation-where-hover */')).toContain(
			'where: SemanticArticleWhereInput',
		)
		expect(quickInfo('/* public-update-where-hover */')).toContain(
			'SemanticArticleWhereInput',
		)
		expect(quickInfo('/* public-delete-where-hover */')).toContain(
			'SemanticArticleWhereInput',
		)
		expect(quickInfo('/* public-count-where-hover */')).toContain(
			'where?: SemanticArticleWhereInput',
		)
	}, 30_000)

	it('accepts a new schema before the next startup generation', () => {
		const source = `${registry}
import { UltimaBase } from '@ultimabase/core'

UltimaBase.Schema.define({
  className: 'MissingGeneratedSchema',
  fields: (field) => ({ title: field.string() }),
})
`
		const fileName = path.join(
			import.meta.dirname,
			'generated-new-schema.semantic.fixture.ts',
		)
		workspace.addFile(fileName, source)
		expect(service.getSemanticDiagnostics(fileName)).toStrictEqual([])
	})

	it('rejects unknown generated sibling fields in schema indexes', () => {
		const source = `${registry}
import { UltimaBase } from '@ultimabase/core'

UltimaBase.Schema.define({
  className: 'SemanticAuthor',
  fields: (field) => ({
    name: field.string({ required: true }),
  }),
  indexes: [{ fields: ['name', 'missing'] }],
})
`
		const fileName = path.join(
			import.meta.dirname,
			'generated-invalid-index.semantic.fixture.ts',
		)
		workspace.addFile(fileName, source)
		const diagnostics = service
			.getSemanticDiagnostics(fileName)
			.map(({ messageText }) =>
				ts.flattenDiagnosticMessageText(messageText, '\n'),
			)
		expect(diagnostics).toHaveLength(1)
		expect(diagnostics[0]).toContain('Type \'"missing"\' is not assignable')
	})
})

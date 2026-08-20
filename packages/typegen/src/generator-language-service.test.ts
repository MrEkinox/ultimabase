import path from 'node:path'

import {
	FrameworkApplication,
	Schema,
	type FieldBuilder,
} from '@ultimabase/core'
import { accessPlugin } from '@ultimabase/access-plugin'
import { hooksPlugin } from '@ultimabase/hooks-plugin'
import {
	pgVectorPlugin,
	type VectorFieldBuilderMethod,
} from '@ultimabase/pg-vector-plugin'
import { RoleSchema, rolesPlugin } from '@ultimabase/roles-plugin'
import * as ts from 'typescript'
import { describe, expect, it } from 'vitest'
import { generateApplicationTypes } from './generator.js'

type GeneratedFixtureBuilder = FieldBuilder & {
	readonly vector: VectorFieldBuilderMethod
}

const selectMarker = '/* generated-select */'
const hoverMarker = '/* generated-hover */'
const targetMarker = '/* generated-target */'

const createGeneratedRegistry = (): string => {
	const Author = Schema.define({
		className: 'SemanticAuthor',
		fields: (field) => ({
			name: field.string({ validation: { required: true } }),
			articles: field.relation({ target: 'SemanticArticle' }),
		}),
	})
	const Article = Schema.define({
		className: 'SemanticArticle',
		fields: (field) => {
			const generatedField = field as GeneratedFixtureBuilder
			return {
				title: field.string({ validation: { required: true } }),
				views: field.int(),
				scores: field.int({ list: true }),
				statuses: field.enum({
					list: true,
					typeName: 'SemanticStatus',
					values: ['draft', 'published'],
				}),
				status: field.enum({
					typeName: 'SemanticStatus',
					validation: { required: true },
					values: ['draft', 'published'],
				}),
				profile: field.object({
					fields: (field) => ({
						displayName: field.string({
							validation: { required: true },
						}),
					}),
					typeName: 'SemanticProfile',
				}),
				profiles: field.object({
					fields: (field) => ({
						displayName: field.string({
							validation: { required: true },
						}),
					}),
					list: true,
					typeName: 'SemanticProfile',
				}),
				author: field.pointer({
					target: 'SemanticAuthor',
					validation: { required: true },
				}),
				related: field.relation({
					target: 'SemanticArticle',
				}),
				embedding: generatedField.vector({
					dimensions: 3,
				}),
				embeddings: generatedField.vector({
					dimensions: 3,
					list: true,
				}),
			}
		},
	})
	const application = new FrameworkApplication({
		plugins: [accessPlugin(), hooksPlugin(), pgVectorPlugin()],
		schemas: [Author, Article],
	})

	return generateApplicationTypes({
		application,
		applicationId: 'fixture.semantic',
	}).contents
}

const createGeneratedRoleRegistry = (): string => {
	const Member = Schema.define({
		className: 'SemanticRoleMember',
		fields: (field) => ({
			name: field.string({ validation: { required: true } }),
		}),
	})
	const roleCandidate: unknown = RoleSchema.define({
		className: 'SemanticRole',
		fields: (field) => ({
			description: field.string(),
		}),
		members: { schema: Member },
	})
	if (!Schema.is(roleCandidate)) {
		throw new TypeError('Expected the semantic role schema to be defined')
	}
	const Role = roleCandidate
	const application = new FrameworkApplication({
		plugins: [hooksPlugin(), rolesPlugin()],
		schemas: [Member, Role],
	})

	return generateApplicationTypes({
		application,
		applicationId: 'fixture.semantic-role',
	}).contents
}

const createSourceLanguageService = (
	fileName: string,
	source: string,
): ts.LanguageService => {
	const repositoryRoot = path.resolve(import.meta.dirname, '../../..')
	const host: ts.LanguageServiceHost = {
		fileExists: (requestedFileName) => ts.sys.fileExists(requestedFileName),
		getCompilationSettings: () => ({
			baseUrl: repositoryRoot,
			exactOptionalPropertyTypes: true,
			module: ts.ModuleKind.NodeNext,
			moduleResolution: ts.ModuleResolutionKind.NodeNext,
			paths: {
				'@ultimabase/core': ['packages/core/src/index.ts'],
				'@ultimabase/pg-vector-plugin': [
					'packages/pg-vector-plugin/src/index.ts',
				],
				'@ultimabase/roles-plugin': ['packages/roles-plugin/src/index.ts'],
				'@ultimabase/shared': ['packages/shared/src/index.ts'],
			},
			strict: true,
			target: ts.ScriptTarget.ESNext,
			types: ['node'],
		}),
		getCurrentDirectory: () => repositoryRoot,
		getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
		getScriptFileNames: () => [fileName],
		getScriptSnapshot: (requestedFileName) => {
			const contents =
				requestedFileName === fileName
					? source
					: ts.sys.readFile(requestedFileName)

			return contents === undefined
				? undefined
				: ts.ScriptSnapshot.fromString(contents)
		},
		getScriptVersion: () => '0',
		readFile: (requestedFileName) => ts.sys.readFile(requestedFileName),
	}

	return ts.createLanguageService(host)
}

describe('generated application TypeScript contracts', () => {
	it('typechecks exact models, operations, relationships, and plugin methods', () => {
		const registry = createGeneratedRegistry()
		const sourceWithMarkers = `${registry}
declare const author: Core.PointerValue
declare const item: SemanticArticleItem
declare const field: ApplicationFieldBuilder

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
    limit: 5,
    offset: 2,
    orderBy: { title: 'asc' },
    select: { id: true, title: true },
    where: { status: { eq: 'draft' } },
  },
}
const exactStatus: 'draft' | 'published' = item.status
const exactVector: readonly number[] | null = item.embedding
const pointerRead = item.author.findOne({
  select: { name: true },
  where: { name: { startsWith: 'A' } },
})
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
void pointerRead
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
		const service = createSourceLanguageService(fileName, source)

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

	it('drives generated RoleSchema fields and persisted commands', () => {
		const registry = createGeneratedRoleRegistry()
		const source = `${registry}
import { Schema } from '@ultimabase/core'
import { RoleSchema } from '@ultimabase/roles-plugin'

const Member = Schema.define({
  className: 'SemanticRoleMember',
  fields: (field) => ({
    name: field.string({ validation: { required: true } }),
  }),
})
const AppRole = RoleSchema.define({
  className: 'SemanticRole',
  fields: (field) => ({ description: field.string() }),
  members: { schema: Member },
})

const draft = new AppRole({ description: 'Editors', name: 'editor' })
const draftDescription: string | null | undefined = draft.description

async function inspectRole() {
  const role = await AppRole.findOne()

  if (role !== null) {
    const description: string | null = role.description
    await role.addMember(Member.pointer('member-1'))
    void description
  }
}

void draft
void draftDescription
void inspectRole
`
		const fileName = path.join(
			import.meta.dirname,
			'generated-role-public-api.semantic.fixture.ts',
		)
		const service = createSourceLanguageService(fileName, source)

		expect(
			service
				.getSemanticDiagnostics(fileName)
				.map(({ messageText }) =>
					ts.flattenDiagnosticMessageText(messageText, '\n'),
				),
		).toStrictEqual([])
	})

	it('drives the actual Core schema, Query, mutation, Access, and hook APIs', () => {
		const registry = createGeneratedRegistry()
		const publicSource = `${registry}
import {
  Schema,
  defineContextualSchemaExtensionFactory,
  defineSchemaExtension,
  increment,
  type SchemaExtension,
  type SchemaExtensionContextKind,
} from '@ultimabase/core'

interface GeneratedExtensionOptions<TData extends Readonly<Record<string, unknown>>> {
  readonly select: (data: TData) => string
}
type GeneratedExtension<TData extends Readonly<Record<string, unknown>>> =
  SchemaExtension<'fixture.generated', GeneratedExtensionOptions<TData>>
type GeneratedExtensionData<TData> =
  TData extends Readonly<Record<string, unknown>> ? TData : never
interface GeneratedExtensionKind extends SchemaExtensionContextKind {
  readonly options: GeneratedExtensionOptions<GeneratedExtensionData<this['data']>>
  readonly extension: GeneratedExtension<GeneratedExtensionData<this['data']>>
}
const generatedExtension =
  defineContextualSchemaExtensionFactory<GeneratedExtensionKind>()(
    <TData extends Readonly<Record<string, unknown>>>(
      options: GeneratedExtensionOptions<TData>,
    ): GeneratedExtension<TData> => defineSchemaExtension('fixture.generated', options),
  )

const SemanticAuthor = Schema.define({
  className: 'SemanticAuthor',
  fields: (field) => ({
    articles: field.relation({
      target: 'SemanticArticle',
    }),
    name: field.string({ validation: { required: true } }),
  }),
})

const SemanticArticle = Schema.define({
  className: 'SemanticArticle',
  fields: (field) => ({
    author: field.pointer({
      target: 'SemanticAuthor',
      validation: { required: true },
    }),
    embedding: field./* public-plugin-method */vector({ dimensions: 3 }),
    profile: field.object({
      fields: (field) => ({
        displayName: field.string({
          validation: { required: true },
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
      validation: { required: true },
      values: ['draft', 'published'],
    }),
    title: field./* public-field-method */string({ validation: { required: true } }),
    views: field.int(),
  }),
  indexes: [{ fields: ['title', 'status'] }],
  extensions: ({ bind }) => [
    bind(generatedExtension, {
      select: (data) => {
        data./* public-extension-data */title
        return data.title
      },
    }),
  ],
  access: {
    update: {
      where: { status: { eq: 'draft' } },
      item: ({ item, originalItem }) => {
        item./* public-access-item */embedding
        return originalItem.status === 'draft' && item.status === 'published'
      },
    },
  },
  hooks: {
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
const draft = new SemanticArticle(createInput)
const exactStatus: 'draft' | 'published' = draft.status
declare const loadedArticle: SemanticArticleItem
const authorRead = loadedArticle.author.findOne({
  /* public-pointer-where-hover */where: { /* public-pointer-where */ name: { startsWith: 'A' } },
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
  /* public-update-id-hover */id: 'article-1',
  data: { status: 'published', views: increment(1) },
  select: { title: true },
  include: { author: { select: { name: true } } },
})

SemanticArticle./* public-delete-one-hover */deleteOne({
  /* public-delete-id-hover */id: 'article-1',
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
    author: SemanticAuthor.pointer('author-1'),
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
SemanticArticle./* public-get-hover */get({ id: 'article-1' })
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
SemanticArticle.createOne({ data: createInput, /* public-create-one-options */ })
SemanticArticle.createMany({ data: [createInput], /* public-create-many-options */ })
SemanticArticle.updateOne({
  where: { id: { eq: 'article-1' } },
  data: { title: 'Completion update' },
  /* public-update-one-options */
})
// @ts-expect-error -- The incomplete target drives both singular target completions.
SemanticArticle.updateOne({
  /* public-update-one-target */
  data: { title: 'Target completion' },
})
// @ts-expect-error -- The incomplete target drives both singular target completions.
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
  data: { scores: increment(1) },
})

// @ts-expect-error -- Generated singular targets are mutually exclusive.
SemanticArticle.updateOne({
  id: 'article-1',
  where: { id: { eq: 'article-1' } },
  data: { title: 'Invalid target' },
})
// @ts-expect-error -- Generated singular targets are mutually exclusive.
SemanticArticle.deleteOne({
  id: 'article-1',
  where: { id: { eq: 'article-1' } },
})

type LoadedArticle = NonNullable<Awaited<ReturnType<typeof SemanticArticle.findOne>>>
declare const persistedArticle: LoadedArticle
const related = persistedArticle.relation('related')
const relatedRead = related.findMany({
  /* public-relation-where-hover */where: { /* public-relation-where */ status: { eq: 'published' } },
  select: { title: true },
})
related.connect(SemanticArticle.pointer('article-2'))
// @ts-expect-error -- Relation mutations retain their exact target schema.
related.connect(SemanticAuthor.pointer('author-2'))

// @ts-expect-error -- A loaded registry rejects a stale schema name.
Schema.define({
  className: 'MissingGeneratedSchema',
  fields: (field) => ({ title: field.string() }),
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
		const service = createSourceLanguageService(fileName, publicSource)

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
		expect(completionNames('/* public-extension-data */')).toEqual(
			expect.arrayContaining([
				'author',
				'embedding',
				'profile',
				'status',
				'title',
			]),
		)
		expect(completionNames('/* public-extension-data */')).not.toEqual(
			expect.arrayContaining(['createdAt', 'id', 'related', 'updatedAt']),
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
			expect(completionNames(marker)).toEqual(
				expect.arrayContaining(['id', 'where']),
			)
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
			'/* public-get-hover */',
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
			'where: SemanticAuthorWhereInput',
		)
		expect(quickInfo('/* public-relation-where-hover */')).toContain(
			'where: SemanticArticleWhereInput',
		)
		expect(quickInfo('/* public-update-where-hover */')).toContain(
			'SemanticArticleWhereInput',
		)
		expect(quickInfo('/* public-update-id-hover */')).toContain('id: string')
		expect(quickInfo('/* public-delete-where-hover */')).toContain(
			'SemanticArticleWhereInput',
		)
		expect(quickInfo('/* public-delete-id-hover */')).toContain('id: string')
		expect(quickInfo('/* public-count-where-hover */')).toContain(
			'where?: SemanticArticleWhereInput',
		)

		service.dispose()
	}, 30_000)

	it('reports an actionable diagnostic for a missing generated schema entry', () => {
		const registry = createGeneratedRegistry()
		const source = `${registry}
import { Schema } from '@ultimabase/core'

Schema.define({
  className: 'MissingGeneratedSchema',
  fields: (field) => ({ title: field.string() }),
})
`
		const fileName = path.join(
			import.meta.dirname,
			'generated-missing-schema.semantic.fixture.ts',
		)
		const service = createSourceLanguageService(fileName, source)
		const diagnostics = service
			.getSemanticDiagnostics(fileName)
			.map(({ messageText }) =>
				ts.flattenDiagnosticMessageText(messageText, '\n'),
			)

		expect(diagnostics).toHaveLength(1)
		expect(diagnostics[0]).toContain(
			'UltimaBase generated schema is missing or stale; regenerate it with @ultimabase/typegen',
		)

		service.dispose()
	})

	it('rejects unknown generated sibling fields in schema indexes', () => {
		const registry = createGeneratedRegistry()
		const source = `${registry}
import { Schema } from '@ultimabase/core'

Schema.define({
  className: 'SemanticAuthor',
  fields: (field) => ({
    name: field.string({ validation: { required: true } }),
  }),
  indexes: [{ fields: ['name', 'missing'] }],
})
`
		const fileName = path.join(
			import.meta.dirname,
			'generated-invalid-index.semantic.fixture.ts',
		)
		const service = createSourceLanguageService(fileName, source)
		const diagnostics = service
			.getSemanticDiagnostics(fileName)
			.map(({ messageText }) =>
				ts.flattenDiagnosticMessageText(messageText, '\n'),
			)

		expect(diagnostics).toHaveLength(1)
		expect(diagnostics[0]).toContain('Type \'"missing"\' is not assignable')

		service.dispose()
	})
})

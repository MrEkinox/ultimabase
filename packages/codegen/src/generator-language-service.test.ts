import path from 'node:path'

import {
	FrameworkApplication,
	Schema,
	type FieldBuilder,
} from '@ultimabase/core'
import {
	pgVectorPlugin,
	type VectorFieldBuilderMethod,
} from '@ultimabase/pg-vector-plugin'
import * as ts from 'typescript'
import { describe, expect, it } from 'vitest'

import { generateApplicationTypes } from './generator.js'

type GeneratedFixtureBuilder = FieldBuilder & {
	readonly vector: VectorFieldBuilderMethod
}

const selectMarker = '/* generated-select */'
const hoverMarker = '/* generated-hover */'

const createGeneratedRegistry = (): string => {
	const Author = Schema.define({
		className: 'SemanticAuthor',
		fields(field) {
			field.string('name', { validation: { required: true } })
			field.relation('articles', { target: () => Article })
		},
	})
	const Article = Schema.define({
		className: 'SemanticArticle',
		fields(field) {
			const generatedField = field as GeneratedFixtureBuilder

			field.string('title', { validation: { required: true } })
			field.int('views')
			field.int('scores', { list: true })
			field.enum('status', {
				typeName: 'SemanticStatus',
				validation: { required: true },
				values: ['draft', 'published'],
			})
			field.object('profile', {
				fields(field) {
					field.string('displayName', {
						validation: { required: true },
					})
				},
				typeName: 'SemanticProfile',
			})
			field.pointer('author', {
				target: () => Author,
				validation: { required: true },
			})
			field.relation('related', { target: () => Article })
			generatedField.vector('embedding', {
				dimensions: 3,
			})
		},
	})
	const application = new FrameworkApplication({
		plugins: [pgVectorPlugin()],
		schemas: [Author, Article],
	})

	return generateApplicationTypes({
		application,
		applicationId: 'fixture.semantic',
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
declare const author: PointerValue
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
const where: ${hoverMarker}SemanticArticleWhere = {
  author: { is: { name: { startsWith: 'Ada' } } },
  profile: { at: [{ path: ['displayName'], startsWith: 'A' }] },
  related: { count: { gte: 3, where: { status: { eq: 'published' } } } },
  status: { in: ['draft', 'published'] },
}
const selection: SemanticArticleSelect = { ${selectMarker} }
const order: readonly SemanticArticleOrderBy[] = [
  { status: 'asc' },
  { title: 'desc' },
]
const include: SemanticArticleInclude = {
  author: { select: { id: true, name: true } },
  related: {
    limit: 5,
    offset: 2,
    orderBy: [{ title: 'asc' }],
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
const hookItem: SemanticArticleHooks['item'] = item
const accessWhere: SemanticArticleAccess['where'] = where

field.vector('embedding', { dimensions: 3 })

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
const invalidOrder: SemanticArticleOrderBy = {
  // @ts-expect-error -- One order object accepts exactly one field.
  status: 'asc', title: 'desc',
}

void accessWhere
void createInput
void exactStatus
void exactVector
void hookItem
void include
void invalidEnum
void invalidOrder
void invalidSelection
void invalidUpdate
void order
void pointerRead
void selection
void updateInput
`
		const selectPosition = sourceWithMarkers.indexOf(selectMarker)
		const hoverPosition = sourceWithMarkers.indexOf(hoverMarker)
		const source = sourceWithMarkers
			.replace(selectMarker, ' '.repeat(selectMarker.length))
			.replace(hoverMarker, ' '.repeat(hoverMarker.length))
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

		const hover = service.getQuickInfoAtPosition(
			fileName,
			hoverPosition + hoverMarker.length,
		)
		const display = ts.displayPartsToString(hover?.displayParts)

		expect(display).toContain('SemanticArticleWhere')
		expect(display.length).toBeLessThan(500)
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
  fields(field) {
    field.string('name', { validation: { required: true } })
    field.relation('articles', { target: () => SemanticArticle })
  },
})

const SemanticArticle = Schema.define({
  className: 'SemanticArticle',
  fields(field) {
    field./* public-field-method */string('title', { validation: { required: true } })
    field.enum('status', {
      validation: { required: true },
      values: ['draft', 'published'],
    })
    field.int('views')
    field.int('scores', { list: true })
    field.object('profile', {
      fields(field) {
        field.string('displayName', {
          validation: { required: true },
          access: {
            read: {
              output: ({ value }) => value.length > 0,
              where: true,
              orderBy: true,
            },
            write: true,
          },
          hooks: { resolveInput: ({ value }) => value.trim() },
        })
      },
    })
    field.pointer('author', {
      target: () => SemanticAuthor,
      validation: { required: true },
    })
    field.relation('related', { target: () => SemanticArticle })
    field./* public-plugin-method */vector('embedding', { dimensions: 3 })
  },
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

const draft = new SemanticArticle({
  author: SemanticAuthor.pointer('author-1'),
  status: 'draft',
  title: 'Generated public API',
})
const exactStatus: 'draft' | 'published' = draft.status
declare const loadedArticle: SemanticArticleHooks['item']
const authorRead = loadedArticle.author.findOne({
  where: { /* public-pointer-where */ name: { startsWith: 'A' } },
  select: { /* public-pointer-handle-select */ name: true },
})
type AuthorRead = Awaited<typeof authorRead>
declare const loadedAuthor: NonNullable<AuthorRead>
const exactAuthorName: string = loadedAuthor.name
// @ts-expect-error -- The generated pointer handle exposes only Author fields.
loadedAuthor.title

const result = SemanticArticle.findMany({
  where: { /* public-query-where */ status: { eq: 'draft' } },
  select: { /* public-query-select */ title: true, status: true },
  include: {
    author: { select: { /* public-pointer-select */ name: true } },
    related: { where: { status: { eq: 'published' } } },
  },
})
const invalidObjectPath: SemanticArticleWhere = {
  profile: {
    at: [{
      // @ts-expect-error -- Generated object occurrences retain exact paths.
      path: ['missing'],
      eq: 'invalid',
    }],
  },
}

SemanticArticle.updateOne({
  where: { id: { eq: 'article-1' } },
  data: { status: 'published', views: increment(1) },
})

SemanticArticle.updateOne({
  where: { id: { eq: 'article-1' } },
  // @ts-expect-error -- Generated numeric lists cannot use scalar increments.
  data: { scores: increment(1) },
})

type LoadedArticle = NonNullable<Awaited<ReturnType<typeof SemanticArticle.findOne>>>
declare const persistedArticle: LoadedArticle
const related = persistedArticle.relation('related')
const relatedRead = related.findMany({
  where: { /* public-relation-where */ status: { eq: 'published' } },
  select: { title: true },
})
related.connect(SemanticArticle.pointer('article-2'))
// @ts-expect-error -- Relation mutations retain their exact target schema.
related.connect(SemanticAuthor.pointer('author-2'))

// @ts-expect-error -- A loaded registry rejects a stale schema name.
Schema.define({ className: 'MissingGeneratedSchema', fields(field) { field.string('title') } })

void exactStatus
void exactAuthorName
void authorRead
void result
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

		service.dispose()
	}, 15_000)

	it('reports an actionable diagnostic for a missing generated schema entry', () => {
		const registry = createGeneratedRegistry()
		const source = `${registry}
import { Schema } from '@ultimabase/core'

Schema.define({
  className: 'MissingGeneratedSchema',
  fields(field) { field.string('title') },
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
			'UltimaBase generated schema is missing or stale; run ultimabase generate',
		)

		service.dispose()
	})

	it('rejects unknown generated sibling fields in schema indexes', () => {
		const registry = createGeneratedRegistry()
		const source = `${registry}
import { Schema } from '@ultimabase/core'

Schema.define({
  className: 'SemanticAuthor',
  fields(field) { field.string('name', { validation: { required: true } }) },
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

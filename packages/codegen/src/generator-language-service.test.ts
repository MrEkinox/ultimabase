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
		expect(service.getSemanticDiagnostics(fileName)).toStrictEqual([])
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
})

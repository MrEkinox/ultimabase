import path from 'node:path'

import * as ts from 'typescript'
import { afterAll, describe, expect, it } from 'vitest'

import {
	createGeneratedRegistry,
	createSourceLanguageServiceWorkspace,
} from '../tests/fixtures/generator-language-service.js'

const targetWhereMarker = '/* source-graph-target-where */'
const targetSelectMarker = '/* source-graph-target-select */'
const schemaHoverMarker = '/* source-graph-schema-hover */'
const registry = createGeneratedRegistry()
const workspace = createSourceLanguageServiceWorkspace()
const fixtureDirectory = path.join(
	import.meta.dirname,
	'.source-schema-graph-fixture',
)

workspace.addFile(
	path.join(fixtureDirectory, 'schema.generated.d.ts'),
	registry,
)
workspace.addFile(
	path.join(fixtureDirectory, 'author.ts'),
	`import { UltimaBase } from '@ultimabase/core'

export const Author = UltimaBase.Schema.define({
  className: 'SemanticAuthor',
  fields: (field) => ({
    articles: field.relation({ target: 'SemanticArticle' }),
    name: field.string({ required: true }),
  }),
})
`,
)
const articleFile = path.join(fixtureDirectory, 'article.ts')
const articleSourceWithMarker = `import { UltimaBase } from '@ultimabase/core'

export const ${schemaHoverMarker}Article = UltimaBase.Schema.define({
  className: 'SemanticArticle',
  fields: (field) => ({
    author: field.pointer({ target: 'SemanticAuthor', required: true }),
    related: field.relation({ target: 'SemanticArticle' }),
    status: field.enum({ required: true, values: ['draft', 'published'] }),
    title: field.string({ required: true }),
  }),
})
`
const schemaHoverPosition = articleSourceWithMarker.indexOf(schemaHoverMarker)
workspace.addFile(
	articleFile,
	articleSourceWithMarker.replace(
		schemaHoverMarker,
		' '.repeat(schemaHoverMarker.length),
	),
)

const usageWithMarkers = `import { Article } from './article.js'
import { Author } from './author.js'

// @ts-expect-error -- Schemas are not constructible (ADR-0310).
const draft = new Article({
  author: Author.pointer('author-1'),
  status: 'draft',
  title: 'Source graph',
})
const created = Article.createOne({ data: {
  author: { create: { name: 'Ada' } },
  status: 'draft',
  title: 'Source graph',
} })
const articles = Article.findMany({
  include: { author: { select: { ${targetSelectMarker} } } },
  where: { author: { is: { ${targetWhereMarker} } } },
})

Article.findMany({
  where: {
    author: {
      is: {
        // @ts-expect-error -- The generated name graph exposes only Author fields.
        missing: { eq: true },
      },
    },
  },
})

const authorPointer = Author.pointer('author-1')
void [articles, authorPointer, created, draft]
`
const markerPositions = new Map(
	[targetWhereMarker, targetSelectMarker].map((marker) => [
		marker,
		usageWithMarkers.indexOf(marker),
	]),
)
const usageFile = path.join(fixtureDirectory, 'usage.ts')
workspace.addFile(
	usageFile,
	usageWithMarkers.replace(
		/\/\* source-graph-target-(?:where|select) \*\//gu,
		(marker) => ' '.repeat(marker.length),
	),
)

afterAll(() => {
	workspace.service.dispose()
})

const completionNames = (marker: string): readonly string[] => {
	const position = markerPositions.get(marker)
	if (position === undefined || position < 0) {
		throw new TypeError(`Missing source graph marker: ${marker}`)
	}
	return (
		workspace.service.getCompletionsAtPosition(usageFile, position, {})
			?.entries ?? []
	).map(({ name }) => name)
}

describe('source-typed schemas with the retained generated name graph', () => {
	it('resolves circular schemas across modules without source registration', () => {
		expect(
			workspace.service
				.getSemanticDiagnostics(usageFile)
				.map(({ messageText }) =>
					ts.flattenDiagnosticMessageText(messageText, '\n'),
				),
		).toStrictEqual([])
		expect(completionNames(targetWhereMarker)).toEqual(
			expect.arrayContaining(['AND', 'articles', 'name']),
		)
		expect(completionNames(targetSelectMarker)).toEqual(
			expect.arrayContaining(['createdAt', 'id', 'name', 'updatedAt']),
		)
		const hover = workspace.service.getQuickInfoAtPosition(
			articleFile,
			schemaHoverPosition + schemaHoverMarker.length,
		)
		const display = ts.displayPartsToString(hover?.displayParts)

		expect(display).toContain('SchemaReference<"SemanticArticle"')
		expect(display.length).toBeLessThan(2_000)
	})
})

import path from 'node:path'

import { UltimaBase } from '@ultimabase/core'
import * as ts from 'typescript'
import { describe, expect, it } from 'vitest'

import { generateApplicationTypes } from './generator.js'

const createNestedWriteRegistry = (): string => {
	const Author = UltimaBase.Schema.define({
		className: 'GeneratedNestedAuthor',
		fields: (field) => ({
			name: field.string({ required: true }),
			posts: field.relation({
				mappedBy: 'author',
				target: 'GeneratedNestedPost',
			}),
		}),
	})
	const Post = UltimaBase.Schema.define({
		className: 'GeneratedNestedPost',
		fields: (field) => ({
			author: field.pointer({
				required: true,
				target: 'GeneratedNestedAuthor',
			}),
			reviewer: field.pointer({ target: 'GeneratedNestedAuthor' }),
			tags: field.relation({ target: 'GeneratedNestedTag' }),
			title: field.string({ required: true }),
			views: field.int(),
		}),
	})
	const Tag = UltimaBase.Schema.define({
		className: 'GeneratedNestedTag',
		fields: (field) => ({ label: field.string({ required: true }) }),
	})
	const application = new UltimaBase({ schemas: [Author, Post, Tag] })

	return generateApplicationTypes({
		ultimabase: application,
		applicationId: 'fixture.nested-writes',
	}).contents
}

const createLanguageService = (
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
				'@ultimabase/core/plugin': ['packages/core/src/plugin.ts'],
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

describe('generated nested-write contracts', () => {
	it('emits recursive aliases and application registry inputs', () => {
		const registry = createNestedWriteRegistry()

		expect(registry).toContain(
			'export type GeneratedNestedPostNestedCreateInput = {',
		)
		expect(registry).toContain(
			'Core.NestedPointerCreateInput<GeneratedNestedAuthorNestedCreateInput>',
		)
		expect(registry).toContain(
			'Core.NestedRelationUpdateInput<GeneratedNestedTagNestedCreateInput, GeneratedNestedTagNestedUpdateInput, true>',
		)
		expect(registry).toContain(
			`Core.NestedRelationCreateInput<Omit<GeneratedNestedPostNestedCreateInput, "author">>`,
		)
		expect(registry).toContain(
			'Core.NestedRelationUpdateInput<Omit<GeneratedNestedPostNestedCreateInput, "author">, GeneratedNestedPostNestedUpdateInput, false>',
		)
		expect(registry).toContain(
			'readonly nestedCreate: GeneratedNestedPostNestedCreateInput',
		)
		expect(registry).toContain(
			'readonly nestedUpdate: GeneratedNestedPostNestedUpdateData',
		)
	})

	it('provides exact recursive autocomplete and rejects superseded inputs', () => {
		const registry = createNestedWriteRegistry()
		const source = `${registry}
import { UltimaBase } from '@ultimabase/core'

const GeneratedNestedAuthor = UltimaBase.Schema.define({
  className: 'GeneratedNestedAuthor',
  fields: (field) => ({
    name: field.string({ required: true }),
    posts: field.relation({
      mappedBy: 'author',
      target: 'GeneratedNestedPost',
    }),
  }),
})
const GeneratedNestedPost = UltimaBase.Schema.define({
  className: 'GeneratedNestedPost',
  fields: (field) => ({
    author: field.pointer({
      required: true,
      target: 'GeneratedNestedAuthor',
    }),
    reviewer: field.pointer({ target: 'GeneratedNestedAuthor' }),
    tags: field.relation({ target: 'GeneratedNestedTag' }),
    title: field.string({ required: true }),
    views: field.int(),
  }),
})
const GeneratedNestedTag = UltimaBase.Schema.define({
  className: 'GeneratedNestedTag',
  fields: (field) => ({ label: field.string({ required: true }) }),
})

GeneratedNestedPost.createOne({
  data: {
    author: { /* pointer-create */connect: 'author-1' },
    reviewer: { create: { name: 'Reviewer' } },
    tags: {
      create: [{ label: 'new' }],
      /* relation-create */connect: ['tag-1'],
    },
    title: 'Post',
  },
})

GeneratedNestedPost.updateOne({
  where: { id: { eq: 'post-1' } },
  data: {
    author: { /* pointer-update */update: { name: 'Renamed' } },
    reviewer: null,
    tags: {
      /* relation-update */connect: ['tag-2'],
      update: [{ id: 'tag-1', data: { label: 'Edited' } }],
    },
  },
})

GeneratedNestedPost.updateOne({
  where: { id: { eq: 'post-1' } },
  data: { title: 'Updated', views: { increment: 1 } },
})

// @ts-expect-error -- A required pointer cannot be unlinked with null.
const requiredDisconnect: GeneratedNestedPostNestedUpdateData = { author: null }
// @ts-expect-error -- Pointer commands are exclusive.
const pointerConflict: GeneratedNestedPostNestedUpdateData = { reviewer: { connect: 'one', update: { name: 'Ada' } } }
// @ts-expect-error -- Relation replacement commands are exclusive.
const relationConflict: GeneratedNestedPostNestedUpdateData = { tags: { set: [], connect: ['tag-1'] } }
// @ts-expect-error -- Inverse create input omits its injected pointer.
const inverseOverride: GeneratedNestedAuthorNestedCreateInput = { name: 'Ada', posts: { create: [{ author: { connect: 'other' }, title: 'Invalid' }] } }
// @ts-expect-error -- Singular updates require at least one field.
GeneratedNestedPost.updateOne({ where: { id: { eq: 'post-1' } }, data: {} })

declare const post: Core.SchemaResult<typeof GeneratedNestedPost>
GeneratedNestedPost.updateOne({ where: { id: { eq: post.id } }, data: { tags: { connect: ['tag-1'] } } })
// @ts-expect-error -- Results have no relation handles (ADR-0310).
post.relation

void requiredDisconnect
void pointerConflict
void relationConflict
void inverseOverride
`
		const fileName = path.join(
			import.meta.dirname,
			'generated-nested-writes.semantic.fixture.ts',
		)
		const service = createLanguageService(fileName, source)
		const diagnostics = service
			.getSemanticDiagnostics(fileName)
			.map(({ messageText }) =>
				ts.flattenDiagnosticMessageText(messageText, '\n'),
			)

		expect(diagnostics).toStrictEqual([])
		const completionNames = (marker: string): readonly string[] =>
			service
				.getCompletionsAtPosition(
					fileName,
					source.indexOf(marker) + marker.length,
					{},
				)
				?.entries.map(({ name }) => name) ?? []

		expect(completionNames('/* pointer-create */')).toEqual(
			expect.arrayContaining(['connect', 'create']),
		)
		expect(completionNames('/* pointer-create */')).not.toContain('disconnect')
		expect(completionNames('/* pointer-update */')).toEqual(
			expect.arrayContaining(['connect', 'create', 'update']),
		)
		expect(completionNames('/* pointer-update */')).not.toContain('disconnect')
		expect(completionNames('/* relation-create */')).toContain('connect')
		expect(completionNames('/* relation-update */')).toEqual(
			expect.arrayContaining(['connect', 'create', 'disconnect', 'set']),
		)
		// ADR-0308: `{ set: [] }` replaced `{ clear: true }`.
		expect(completionNames('/* relation-update */')).not.toContain('clear')
		// The existing update key is correctly omitted from sibling completions.
		expect(completionNames('/* relation-update */')).not.toContain('update')

		service.dispose()
	}, 30_000)
})

import type { SymbolDisplayPart } from 'typescript'
import { describe, expect, it } from 'vitest'

import {
	createLanguageService,
	readMarkedQuickInfo,
} from '../../../../tooling/vitest/typescript-language-service.js'

/** Joins TypeScript display parts exactly as an editor presents them. */
const readDisplay = (parts: readonly SymbolDisplayPart[] | undefined): string =>
	parts?.map(({ text }) => text).join('') ?? ''

describe('Query IntelliSense', () => {
	it('documents the exact byId parameter without expanding terminal internals', () => {
		const quickInfo = readMarkedQuickInfo(
			`${import.meta.dirname}/query-by-id-hover.fixture.ts`,
			`
import { Schema, stringField } from '../../src/index.js'
import { Query } from '../../src/query/index.js'

const PostSchema = Schema.define({ className: 'Post', fields: { title: stringField() } })
const identified = new Query(PostSchema)./* hover */byId('0194f292-0dd9-7c2d-a0a3-a2f755a3d90a')
`,
		)
		const display = readDisplay(quickInfo.displayParts)
		const documentation = readDisplay(quickInfo.documentation)

		expect(display).toContain('byId(id: string): Query<')
		expect(display).not.toContain('OperationObjectId')
		expect(documentation).toContain(
			'Adds an equality filter for the framework-owned object identifier',
		)
		expect(quickInfo.tags?.some(({ name }) => name === 'example')).toBe(true)
	})

	it('documents compact contextual terminals and their explicit owner option', () => {
		const marker = '/* completion */'
		const sourceWithMarker = `
import { Schema, UltimaBase, stringField } from '../../src/index.js'

const Post = Schema.define({ className: 'Post', fields: { title: stringField() } })
const ultimabase = new UltimaBase({ schemas: [Post], plugins: [] })
Post.query().find({ ${marker} })
void ultimabase
`
		const position = sourceWithMarker.indexOf(marker)
		const source = sourceWithMarker.replace(marker, ' '.repeat(marker.length))
		const fileName = `${import.meta.dirname}/query-terminal-options.fixture.ts`
		const service = createLanguageService(fileName, source)
		const completions = service.getCompletionsAtPosition(fileName, position, {})
		const owner = completions?.entries.find(({ name }) => name === 'ultimabase')

		if (owner === undefined) {
			throw new TypeError('Missing Query terminal owner completion')
		}

		const details = service.getCompletionEntryDetails(
			fileName,
			position,
			owner.name,
			undefined,
			owner.source,
			undefined,
			owner.data,
		)
		const documentation = readDisplay(details?.documentation)

		expect(documentation).toContain('exact started application')
		expect(details?.tags?.some(({ name }) => name === 'example')).toBe(true)

		const terminal = readMarkedQuickInfo(
			`${import.meta.dirname}/query-terminal-hover.fixture.ts`,
			`
import { Schema, stringField } from '../../src/index.js'
const Post = Schema.define({ className: 'Post', fields: { title: stringField() } })
Post.query()./* hover */find()
`,
		)
		const display = readDisplay(terminal.displayParts)

		expect(display).toContain('find(options?: QueryTerminalOptions)')
		expect(display).not.toContain('SchemaDefinition<')
		expect(display.length).toBeLessThan(900)
	})

	it('suggests and documents concise singular mutation aliases', () => {
		const marker = '/* completion */'
		const sourceWithMarker = `
import { Schema, stringField } from '../../src/index.js'
const Post = Schema.define({ className: 'Post', fields: { title: stringField() } })
Post.query().${marker}
`
		const position = sourceWithMarker.indexOf(marker)
		const source = sourceWithMarker.replace(marker, ' '.repeat(marker.length))
		const fileName = `${import.meta.dirname}/query-singular-aliases.fixture.ts`
		const service = createLanguageService(fileName, source)
		const completions = service.getCompletionsAtPosition(fileName, position, {})
		const completionNames = new Set(
			completions?.entries.map(({ name }) => name) ?? [],
		)

		expect(completionNames.has('update')).toBe(true)
		expect(completionNames.has('delete')).toBe(true)

		const update = readMarkedQuickInfo(
			`${import.meta.dirname}/query-update-alias-hover.fixture.ts`,
			`
import { Schema, intField } from '../../src/index.js'
const Post = Schema.define({ className: 'Post', fields: { views: intField() } })
Post.query()./* hover */update({ increment: { views: 1 } })
`,
		)
		const deletion = readMarkedQuickInfo(
			`${import.meta.dirname}/query-delete-alias-hover.fixture.ts`,
			`
import { Schema, stringField } from '../../src/index.js'
const Post = Schema.define({ className: 'Post', fields: { title: stringField() } })
Post.query()./* hover */delete()
`,
		)

		expect(readDisplay(update.displayParts)).toContain('update(input:')
		expect(readDisplay(update.documentation)).toContain(
			'concise singular alias for `updateOne`',
		)
		expect(update.tags?.some(({ name }) => name === 'example')).toBe(true)
		expect(readDisplay(deletion.displayParts)).toContain(
			'delete(options?: QueryTerminalOptions)',
		)
		expect(readDisplay(deletion.documentation)).toContain(
			'concise singular alias for `deleteOne`',
		)
		expect(deletion.tags?.some(({ name }) => name === 'example')).toBe(true)
	})
})

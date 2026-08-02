import * as ts from 'typescript'
import { describe, expect, it } from 'vitest'

import {
	createLanguageService,
	readMarkedQuickInfo,
} from '../../../tooling/vitest/typescript-language-service.js'

interface IntelliSenseDocumentation {
	readonly documentation: string
	readonly hasExample: boolean
}

const ultimaBaseOptionNames = [
	'masterAuthority',
	'plugins',
	'schemas',
	'validation',
] as const

/** Reads documentation consistently from QuickInfo and completion details. */
const readDocumentation = (
	documentation: readonly ts.SymbolDisplayPart[] | undefined,
	tags: readonly ts.JSDocTagInfo[] | undefined,
): IntelliSenseDocumentation => ({
	documentation: documentation?.map(({ text }) => text).join('') ?? '',
	hasExample: tags?.some(({ name }) => name === 'example') ?? false,
})

describe('UltimaBase IntelliSense', () => {
	it('suggests and documents every constructor option', () => {
		const marker = '/* completion */'
		const sourceWithMarker = `
import { UltimaBase } from '../src/index.js'

new UltimaBase({ ${marker} })
`
		const position = sourceWithMarker.indexOf(marker)
		const source = sourceWithMarker.replace(marker, ' '.repeat(marker.length))
		const fileName = `${import.meta.dirname}/ultima-base-completion.fixture.ts`
		const service = createLanguageService(fileName, source)
		const completions = service.getCompletionsAtPosition(fileName, position, {
			includeCompletionsWithInsertText: true,
		})

		if (completions === undefined) {
			throw new TypeError('Expected UltimaBase option completions')
		}

		const entries = completions.entries.filter(
			(entry) => entry.kind === ts.ScriptElementKind.memberVariableElement,
		)

		expect(entries.map(({ name }) => name).sort()).toStrictEqual(
			[...ultimaBaseOptionNames].sort(),
		)

		for (const entry of entries) {
			const details = service.getCompletionEntryDetails(
				fileName,
				position,
				entry.name,
				undefined,
				entry.source,
				undefined,
				entry.data,
			)

			if (details === undefined) {
				throw new TypeError(`Missing UltimaBase option details: ${entry.name}`)
			}

			const documentation = readDocumentation(
				details.documentation,
				details.tags,
			)

			if (documentation.documentation.trim().length === 0) {
				throw new TypeError(`Undocumented UltimaBase option: ${entry.name}`)
			}

			expect(documentation.hasExample).toBe(true)
		}
	})

	it('documents the facade and keeps direct query hovers compact', () => {
		const fileName = `${import.meta.dirname}/ultima-base-hover.fixture.ts`
		const facade = readMarkedQuickInfo(
			fileName,
			`
import { UltimaBase } from '../src/index.js'

const ultimabase = /* hover */new UltimaBase({ schemas: [], plugins: [] })
`,
		)
		const query = readMarkedQuickInfo(
			fileName,
			`
import { Schema, stringField } from '@ultimabase/schema'
import { UltimaBase } from '../src/index.js'

const PostSchema = new Schema({ className: 'Post', fields: { title: stringField() } })
const ultimabase = new UltimaBase({ schemas: [PostSchema], plugins: [] })
const posts = ultimabase./* hover */query(PostSchema)
`,
		)
		const facadeDocumentation = readDocumentation(
			facade.documentation,
			facade.tags,
		)
		const queryDisplay = query.displayParts?.map(({ text }) => text).join('')

		expect(facadeDocumentation.documentation).toContain(
			'Owns one isolated UltimaBase application',
		)
		expect(facadeDocumentation.hasExample).toBe(true)
		expect(queryDisplay).toContain('UltimaBaseQuery<')
		expect(queryDisplay).not.toContain('RequestEngine<')
		expect(queryDisplay).not.toContain('SchemaDefinition<')
	})
})

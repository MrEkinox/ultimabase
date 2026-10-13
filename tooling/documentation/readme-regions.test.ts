import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { extractCodeRegion, listCodeRegions } from './code-regions.ts'
import { listRegionDocuments, renderRegionMarkers } from './readme-regions.ts'

const repositoryRoot = path.resolve(import.meta.dirname, '../..')

const source = `import { a } from 'a'
//#region outer
export const outer = () => {
	//#region inner
	return a
	//#endregion inner
}
//#endregion outer
`

describe('code regions (ADR-0330)', () => {
	it('extracts a dedented region without nested markers, like Fumadocs', () => {
		expect(listCodeRegions(source)).toStrictEqual(['outer', 'inner'])
		expect(extractCodeRegion(source, 'outer')).toBe(
			'export const outer = () => {\n\treturn a\n}',
		)
		expect(extractCodeRegion(source, 'inner')).toBe('return a')
	})

	it('rejects a missing or unclosed region', () => {
		expect(() => extractCodeRegion(source, 'absent')).toThrow(
			'Region "absent" not found',
		)
		expect(() => extractCodeRegion('//#region open\ncode', 'open')).toThrow(
			'Region "open" is not closed by //#endregion open',
		)
	})

	it('renders README markers from their regions', () => {
		const readme = [
			'Intro',
			'<!-- region ./code.ts#inner,outer -->',
			'stale',
			'<!-- endregion -->',
			'',
		].join('\n')
		const rendered = renderRegionMarkers(readme, '/docs/README.md', (file) => {
			expect(file).toBe('/docs/code.ts')
			return source
		})
		expect(rendered).toBe(
			[
				'Intro',
				'<!-- region ./code.ts#inner,outer -->',
				'',
				'```ts',
				'return a',
				'',
				'export const outer = () => {\n\treturn a\n}',
				'```',
				'',
				'<!-- endregion -->',
				'',
			].join('\n'),
		)
	})

	it('keeps every package and example README in sync with its regions', () => {
		const stale = listRegionDocuments(repositoryRoot).filter((document) => {
			const current = readFileSync(document, 'utf8')
			return renderRegionMarkers(current, document) !== current
		})
		// Run `yarn docs:regions` after changing an example region.
		expect(stale.map((file) => path.relative(repositoryRoot, file))).toEqual([])
	})
})

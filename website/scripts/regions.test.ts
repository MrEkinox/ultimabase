import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { codeBlock, fromWebsite, includesOf, region } from './regions.ts'

const file = [
	'const before = 1',
	'//#region model',
	'\texport const Post = defineModel({',
	'\t\t//#region fields',
	'\t\tfields: (f) => ({ title: f.string() }),',
	'\t\t//#endregion',
	'',
	'\t})',
	'//#endregion',
	'//#region open',
	'const never = 1',
].join('\n')

describe('region', () => {
	it('reads a region as Fumadocs does: nested markers out, indent removed', () => {
		expect(region(file, 'model')).toBe(
			[
				'export const Post = defineModel({',
				'\tfields: (f) => ({ title: f.string() }),',
				'',
				'})',
			].join('\n'),
		)
		expect(region(file, 'fields')).toBe(
			'fields: (f) => ({ title: f.string() }),',
		)
	})

	it('ends a region at its own name', () => {
		expect(region('//#region a\nx\n//#endregion a', 'a')).toBe('x')
		expect(region('//#region a\nx\n//#endregion b\ny\n//#endregion', 'a')).toBe(
			'x\ny',
		)
	})

	it('finds no region that is missing or never closed', () => {
		expect(region(file, 'missing')).toBeUndefined()
		expect(region(file, 'open')).toBeUndefined()
	})
})

describe('includesOf', () => {
	it('reads the file and region of each include', () => {
		const page =
			'Text\n\n<include cwd>../examples/a/src/b.ts#model</include>\n\n<include>c.ts</include>\n'
		const includes = includesOf(page)
		expect(includes).toEqual([
			{
				tag: '<include cwd>../examples/a/src/b.ts#model</include>',
				file: '../examples/a/src/b.ts',
				region: 'model',
			},
			{ tag: '<include>c.ts</include>', file: 'c.ts', region: undefined },
		])
		expect(includes.map(fromWebsite)).toEqual([true, false])
	})
})

describe('codeBlock', () => {
	it('writes a region as a block in its file language, fenced past its own fences', () => {
		const directory = mkdtempSync(join(tmpdir(), 'regions-'))
		writeFileSync(
			join(directory, 'a.ts'),
			'//#region doc\nconst md = "```"\n//#endregion\n',
		)
		const [include] = includesOf('<include cwd>a.ts#doc</include>')
		expect(include && codeBlock(directory, include)).toBe(
			'````ts\nconst md = "```"\n````',
		)
	})

	it('names a region that is missing', () => {
		const directory = mkdtempSync(join(tmpdir(), 'regions-'))
		writeFileSync(join(directory, 'a.ts'), 'const a = 1\n')
		const [include] = includesOf('<include cwd>a.ts#doc</include>')
		expect(() => include && codeBlock(directory, include)).toThrow(
			'a.ts has no region "doc"',
		)
	})
})

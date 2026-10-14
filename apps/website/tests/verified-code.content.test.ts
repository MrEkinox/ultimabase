import { globSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import {
	classifyCodeBlocks,
	listDocumentationFiles,
	regionProblem,
	repositoryRoot,
	type CodeBlockKind,
} from './code-blocks'

// ADR-0330: every TypeScript or JavaScript block of every website page and
// of the root, package and example READMEs is an included example region, a
// compiled snippet (`twoslash`), or marked `unverified`. A document escapes
// the rule only here, with its reason; the test fails once it complies.
const exemptDocuments = new Map<string, string>([
	[
		'apps/website/content/docs/1.0.0/plugins/official/postgresql-vector.mdx',
		'pg-vector is unfinished: its page waits for the plugin (ADR-0330)',
	],
	[
		'packages/pg-vector-plugin/README.md',
		'pg-vector is unfinished: its README waits for the plugin (ADR-0330)',
	],
])

const documents = listDocumentationFiles().map((file) => ({
	blocks: classifyCodeBlocks(file),
	name: path.relative(repositoryRoot, file),
}))

/** The `file:line` of each unmarked block of one scanned document. */
const unmarkedLines = (name: string) => {
	const document = documents.find((candidate) => candidate.name === name)
	if (document === undefined) throw new Error(`${name} is not scanned`)
	return document.blocks
		.filter(({ kind }) => kind === 'unmarked')
		.map(({ line }) => `${name}:${String(line)}`)
}

/** The sets the rule covers, found by glob independently of the scanner. */
const documentSets: Readonly<Record<string, readonly string[]>> = {
	pages: globSync('apps/website/content/docs/**/*.mdx', {
		cwd: repositoryRoot,
	}),
	'root README': ['README.md'],
	'package READMEs': globSync('packages/*/README.md', { cwd: repositoryRoot }),
	'example READMEs': globSync('examples/*/README.md', { cwd: repositoryRoot }),
}

describe('verified documentation code (ADR-0330)', () => {
	it.each(
		documents
			.map(({ name }) => name)
			.filter((name) => !exemptDocuments.has(name)),
	)('%s has no unmarked code block', (name) => {
		expect(unmarkedLines(name)).toStrictEqual([])
	})

	it.each([...exemptDocuments])(
		'%s stays exempt only while it has unmarked blocks (%s)',
		(name) => {
			expect(unmarkedLines(name)).not.toStrictEqual([])
		},
	)

	it('scans every page and every root, package and example README', () => {
		const scanned = new Set(documents.map(({ name }) => name))
		for (const [set, files] of Object.entries(documentSets)) {
			expect(files.length, set).toBeGreaterThan(0)
			expect(
				files.filter((file) => !scanned.has(file)),
				set,
			).toStrictEqual([])
		}
		expect(scanned.size).toBe(Object.values(documentSets).flat().length)
	})

	it('flags an unmarked block in a README as in a page', () => {
		const readme = [
			'# Package',
			'',
			'```ts',
			'const unmarked = 1',
			'```',
			'',
			'- A list item:',
			'',
			'  ```js',
			'  const nested = 1',
			'  ```',
			'',
			'```sh',
			'yarn',
			'```',
		].join('\n')
		expect(
			classifyCodeBlocks('/repository/README.md', readme).map(
				({ kind, line }) => [kind, line],
			),
		).toStrictEqual([
			['unmarked', 3],
			['unmarked', 9],
		])
	})

	it('classifies includes, README regions and fence flags', () => {
		const page = [
			'<include cwd meta=\'title="a.ts"\'>',
			'\t../../examples/soft-delete/src/schema.ts#post',
			'</include>',
			'```ts title="b.ts"',
			'const unmarked = 1',
			'```',
			'```ts twoslash',
			'const compiled = 1',
			'```',
			'```js unverified',
			'const marked = 1',
			'```',
			'```bash',
			'yarn',
			'```',
			'<!-- region ../src/a.ts#a -->',
			'',
			'```ts',
			'const copied = 1',
			'```',
			'',
			'<!-- endregion -->',
		].join('\n')
		const blocks = classifyCodeBlocks('/site/page.mdx', page)
		expect(blocks.map(({ kind, line }) => [kind, line])).toStrictEqual([
			['included', 1],
			['unmarked', 4],
			['compiled', 7],
			['unverified', 10],
			['included', 18],
		])
		expect(regionProblem(blocks[0] ?? { kind: 'unmarked', line: 0 })).toBe(
			undefined,
		)
	})

	it('resolves every included region to an existing source region', () => {
		const problems = documents.flatMap(({ blocks, name }) =>
			blocks.flatMap((block) => {
				const problem = regionProblem(block)
				return problem === undefined
					? []
					: [`${name}:${String(block.line)}: ${problem}`]
			}),
		)
		expect(problems).toStrictEqual([])
	})

	it('reports how much of the documentation is verified', () => {
		const kinds: readonly CodeBlockKind[] = [
			'included',
			'compiled',
			'unverified',
			'unmarked',
		]
		const totals = Object.fromEntries(
			Object.entries(documentSets).map(([set, files]) => {
				const blocks = documents
					.filter(({ name }) => files.includes(name))
					.flatMap((document) => document.blocks)
				const counts = kinds.map((kind) => [
					kind,
					blocks.filter((block) => block.kind === kind).length,
				])
				return [set, Object.fromEntries(counts)]
			}),
		)
		console.info('Documentation code blocks by kind (ADR-0330)')
		console.table(totals)
		console.info(`Exempt: ${[...exemptDocuments.keys()].join(', ')}`)
		// The scan must see the site; an empty count would hide a broken path.
		expect(documentSets.pages?.length).toBeGreaterThan(50)
		expect(
			documents
				.filter(({ name }) => name.endsWith('.mdx'))
				.flatMap(({ blocks }) => blocks).length,
		).toBeGreaterThan(100)
	})
})

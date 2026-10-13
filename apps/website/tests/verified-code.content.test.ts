import path from 'node:path'
import { describe, expect, it } from 'vitest'

import {
	classifyCodeBlocks,
	listDocumentationFiles,
	regionProblem,
	repositoryRoot,
	type CodeBlockKind,
} from './code-blocks'

// ADR-0330: every TypeScript or JavaScript block is an included example
// region, a compiled snippet (`twoslash`), or marked `unverified`. A feature
// joins this list once its page and READMEs follow the rule; the other
// documents are only counted until they migrate.
const enforcedDocuments = [
	'apps/website/content/docs/1.0.0/plugins/official/soft-delete.mdx',
	'packages/soft-delete-plugin/README.md',
	'examples/soft-delete/README.md',
	'apps/website/content/docs/1.0.0/plugins/official/access.mdx',
	'packages/access-plugin/README.md',
	'examples/access/README.md',
	'apps/website/content/docs/1.0.0/plugins/official/hooks.mdx',
	'packages/hooks-plugin/README.md',
	'examples/hooks/README.md',
	'apps/website/content/docs/1.0.0/plugins/official/validation.mdx',
	'packages/validation-plugin/README.md',
	'examples/validation/README.md',
	'apps/website/content/docs/1.0.0/plugins/official/acl-permissions.mdx',
	'packages/acl-permissions-plugin/README.md',
	'examples/acl/README.md',
	'apps/website/content/docs/1.0.0/plugins/official/roles.mdx',
	'packages/roles-plugin/README.md',
	'examples/roles/README.md',
	'apps/website/content/docs/1.0.0/plugins/official/password-authentication.mdx',
	'packages/auth-plugin/README.md',
	'packages/auth-password/README.md',
	'examples/auth/README.md',
	'apps/website/content/docs/1.0.0/plugins/official/postgresql.mdx',
	'packages/postgres-plugin/README.md',
	'examples/postgres/README.md',
] as const

const documents = listDocumentationFiles().map((file) => ({
	blocks: classifyCodeBlocks(file),
	name: path.relative(repositoryRoot, file),
}))

describe('verified documentation code (ADR-0330)', () => {
	it.each(enforcedDocuments)('%s has no unmarked code block', (name) => {
		const document = documents.find((candidate) => candidate.name === name)
		if (document === undefined) throw new Error(`${name} is not scanned`)
		expect(
			document.blocks
				.filter(({ kind }) => kind === 'unmarked')
				.map(({ line }) => `${name}:${String(line)}`),
		).toStrictEqual([])
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
		const count = (scope: typeof documents) =>
			Object.fromEntries(
				kinds.map((kind) => [
					kind,
					scope.flatMap(({ blocks }) => blocks.filter((b) => b.kind === kind))
						.length,
				]),
			)
		const pages = documents.filter(({ name }) => name.endsWith('.mdx'))
		const readmes = documents.filter(({ name }) => name.endsWith('.md'))
		const totals = { pages: count(pages), readmes: count(readmes) }
		console.info('Documentation code blocks by kind (ADR-0330)')
		console.table(totals)
		// The scan must see the site; an empty count would hide a broken path.
		expect(pages.length).toBeGreaterThan(50)
		expect(
			Object.values(totals.pages).reduce((a, b) => a + b, 0),
		).toBeGreaterThan(100)
	})
})

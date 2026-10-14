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
	'apps/website/content/docs/1.0.0/plugins/official/http.mdx',
	'apps/website/content/docs/1.0.0/plugins/official/hono-server.mdx',
	'packages/http-plugin/README.md',
	'packages/hono-server-plugin/README.md',
	'packages/api-server/README.md',
	'examples/http/README.md',
	'apps/website/content/docs/1.0.0/plugins/official/rest.mdx',
	'packages/rest-plugin/README.md',
	'examples/rest/README.md',
	'apps/website/content/docs/1.0.0/plugins/official/graphql.mdx',
	'packages/graphql-plugin/README.md',
	'packages/graphql-yoga-plugin/README.md',
	'packages/graphql-http/README.md',
	'packages/graphql-explorer-plugin/README.md',
	'examples/graphql/README.md',
	'apps/website/content/docs/1.0.0/core/application.mdx',
	'apps/website/content/docs/1.0.0/core/data-modeling/schemas.mdx',
	'apps/website/content/docs/1.0.0/core/data-modeling/fields.mdx',
	'apps/website/content/docs/1.0.0/core/data-modeling/models.mdx',
	'apps/website/content/docs/1.0.0/core/data-modeling/defaults.mdx',
	'apps/website/content/docs/1.0.0/core/data-modeling/embedded-objects.mdx',
	'apps/website/content/docs/1.0.0/core/data-modeling/virtual-fields.mdx',
	'apps/website/content/docs/1.0.0/core/data-modeling/relationships.mdx',
	'examples/modeling/README.md',
	'apps/website/content/docs/1.0.0/core/reading-data/overview.mdx',
	'apps/website/content/docs/1.0.0/core/reading-data/filters.mdx',
	'apps/website/content/docs/1.0.0/core/reading-data/selections.mdx',
	'apps/website/content/docs/1.0.0/core/reading-data/ordering-and-pagination.mdx',
	'apps/website/content/docs/1.0.0/core/reading-data/related-data.mdx',
	'apps/website/content/docs/1.0.0/core/writing-data/create.mdx',
	'apps/website/content/docs/1.0.0/core/writing-data/update.mdx',
	'apps/website/content/docs/1.0.0/core/writing-data/delete.mdx',
	'apps/website/content/docs/1.0.0/core/writing-data/upserts.mdx',
	'apps/website/content/docs/1.0.0/core/writing-data/bulk-operations.mdx',
	'apps/website/content/docs/1.0.0/core/writing-data/nested-writes.mdx',
	'apps/website/content/docs/1.0.0/core/writing-data/transactions.mdx',
	'apps/website/content/docs/1.0.0/core/runtime/api-errors.mdx',
	'apps/website/content/docs/1.0.0/core/security-foundations/master-authority.mdx',
	'apps/website/content/docs/1.0.0/core/security-foundations/request-identity.mdx',
	'examples/queries/README.md',
	'apps/website/content/docs/1.0.0/quick-start.mdx',
	'apps/website/content/docs/1.0.0/manual-installation.mdx',
	'apps/website/content/docs/1.0.0/guides/test-an-application.mdx',
	'apps/website/content/docs/1.0.0/operations/troubleshooting.mdx',
	'apps/website/content/docs/1.0.0/operations/typescript-7.mdx',
	'apps/website/content/docs/1.0.0/plugins/overview.mdx',
	'apps/website/content/docs/1.0.0/plugins/using-plugins.mdx',
	'apps/website/content/docs/1.0.0/plugins/build-a-plugin/index.mdx',
	'apps/website/content/docs/1.0.0/plugins/build-a-plugin/schema-contributions.mdx',
	'apps/website/content/docs/1.0.0/plugins/build-a-plugin/runtime-and-infrastructure.mdx',
	'apps/website/content/docs/1.0.0/plugins/build-a-plugin/operations-and-graphql.mdx',
	'packages/plugin-kit/README.md',
	'packages/testing/README.md',
	'examples/plugin-authoring/README.md',
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

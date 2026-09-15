import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const mutationContentRoot = fileURLToPath(
	new URL('../content/docs/en/1.0/mutations/', import.meta.url),
)
describe('mutation documentation contracts', () => {
	it('rejects removed mutation escape hatches and unsupported semantics', async () => {
		const pageNames = [
			'bulk-operations',
			'create',
			'delete',
			'nested-writes',
			'soft-delete',
			'transactions',
			'update',
			'upserts',
		] as const
		const sources = await Promise.all(
			pageNames.map((pageName) =>
				readFile(`${mutationContentRoot}${pageName}.mdx`, 'utf8'),
			),
		)
		const documentedCode = sources
			.flatMap((source) => [
				...source.matchAll(/```ts[^\n]*\n(?<code>[\s\S]*?)```/gu),
			])
			.map((match) => match.groups?.code ?? '')
			.join('\n')

		expect(documentedCode).not.toMatch(/\.save\s*\(/u)
		expect(documentedCode).not.toMatch(/skipHooks/u)
		expect(documentedCode).not.toMatch(/atomic\s*:\s*false/u)
		expect(documentedCode).not.toMatch(/\b(?:delete|upsert)\s*:/u)
		expect(sources.join('\n')).toMatch(
			/Nested delete and upsert commands are not\s+available\./u,
		)
		expect(sources.join('\n')).toMatch(
			/there is no partial-success\s+branch\./u,
		)
		expect(sources.join('\n')).not.toMatch(
			/transaction\.(?:beforeCommit|afterCommit)/u,
		)
	})
})

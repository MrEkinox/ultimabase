import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const contentRoot = fileURLToPath(
	new URL('../content/docs/en/1.0/apis/', import.meta.url),
)
const pageNames = [
	'errors',
	'graphql',
	'graphql-yoga',
	'http-applications',
	'rest',
	'typescript',
] as const

const readDocumentation = async (): Promise<string> =>
	(
		await Promise.all(
			pageNames.map((pageName) =>
				readFile(path.join(contentRoot, `${pageName}.mdx`), 'utf8'),
			),
		)
	).join('\n')

describe('public API documentation contracts', () => {
	it('states transport ownership and authorization boundaries', async () => {
		const documentation = await readDocumentation()
		expect(documentation).toContain('Exposure is never authorization')
		expect(documentation).toContain(
			'Custom schema resolvers receive only `{ request: RequestContext }`',
		)
		expect(documentation).not.toMatch(
			/transport receives (?:an )?(?:application engine|raw adapter|grant)/iu,
		)
	})
})

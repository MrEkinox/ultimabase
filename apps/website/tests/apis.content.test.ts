import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const contentRoot = fileURLToPath(
	new URL('../content/docs/1.0.0/', import.meta.url),
)
const pageNames = [
	'core/runtime/api-errors',
	'plugins/official/http-and-apis/graphql',
	'plugins/official/http-and-apis/http',
	'plugins/official/http-and-apis/rest',
	'core/application',
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
		expect(documentation).toMatch(
			/request labels or plugin values cannot manufacture\s+Master access/u,
		)
		expect(documentation).toContain(
			'Custom schema resolvers receive only `{ request: RequestContext }`',
		)
		expect(documentation).not.toMatch(
			/transport receives (?:an )?(?:application engine|raw adapter|grant)/iu,
		)
	})
})

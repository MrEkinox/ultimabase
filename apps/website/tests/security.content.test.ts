import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'

const contentRoot = fileURLToPath(
	new URL('../content/docs/1.0.0/', import.meta.url),
)
const pageNames = [
	'plugins/official/access',
	'plugins/official/acl-permissions',
	'core/security-foundations/master-authority',
	'core/security-foundations/security-model',
	'plugins/official/password-authentication',
	'core/security-foundations/request-identity',
	'plugins/official/roles',
] as const
let documentation = ''

beforeAll(async () => {
	documentation = (
		await Promise.all(
			pageNames.map((pageName) =>
				readFile(path.join(contentRoot, `${pageName}.mdx`), 'utf8'),
			),
		)
	).join('\n')
})

describe('security documentation contracts', () => {
	it('states every security boundary and rejects authority shortcuts', () => {
		expect(documentation).toMatch(
			/Authentication establishes identity and grants no\s+authorization\./u,
		)
		expect(documentation).toMatch(
			/A role, a role hierarchy, and an authenticated principal\s+grant nothing by themselves\./u,
		)
		expect(documentation).toContain(
			'Client `useMasterKey` flags, shaped contexts, metadata,',
		)
		expect(documentation).toContain(
			'A relation `where`, a UI filter, or a transport projection',
		)
		expect(documentation).toContain(
			'Core structural validation or installed application validation',
		)

		const documentedCode = [
			...documentation.matchAll(/```ts[^\n]*\n(?<code>[\s\S]*?)```/gu),
		]
			.map((match) => match.groups?.code ?? '')
			.join('\n')

		expect(documentedCode).not.toMatch(
			/(?:mode|authority)\s*[:=]+\s*['"](?:user|system)['"]/u,
		)
		expect(documentation).not.toMatch(
			/roles? (?:automatically )?grants? (?:access|permission|authority)/iu,
		)
		expect(documentation).not.toMatch(
			/Master (?:skips|bypasses) (?:validation|Hooks|transactions)/u,
		)
	})
})

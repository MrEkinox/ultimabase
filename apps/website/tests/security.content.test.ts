import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'

import { ACL } from '@ultimabase/acl-permissions-plugin'
import { generateApplicationTypes } from '@ultimabase/typegen'

import { securityApplication } from './fixtures/security/application'
import { Member } from './fixtures/security/schemas'

const contentRoot = fileURLToPath(
	new URL('../content/docs/en/security/', import.meta.url),
)
const generatedPath = fileURLToPath(
	new URL(
		'./fixtures/security/.ultimabase/schema.generated.d.ts',
		import.meta.url,
	),
)
const pageNames = [
	'access',
	'acl',
	'master-authority',
	'overview',
	'password-authentication',
	'request-identity',
	'roles',
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
	it('keeps generated security declarations synchronized', async () => {
		const generated = generateApplicationTypes({
			application: securityApplication.application,
			applicationId: 'website-security',
		})

		expect(generated.contents).toBe(await readFile(generatedPath, 'utf8'))
	})

	it('executes the documented immutable ACL primitive', () => {
		const alice = Member.pointer('0199b38e-ef80-7000-8000-000000000001')
		const initial = new ACL().grantPublic('read')
		const narrowed = initial
			.grantPrincipal(alice, 'read', 'update')
			.revokePublic('read')

		expect(initial.permissionsForPublic()).toEqual(['read'])
		expect(narrowed.permissionsForPublic()).toEqual([])
		expect(ACL.fromJSON(narrowed.toJSON()).toJSON()).toEqual(narrowed.toJSON())
	})

	it('states every security boundary and rejects authority shortcuts', () => {
		expect(documentation).toMatch(
			/Authentication establishes identity and grants no\s+authorization\./u,
		)
		expect(documentation).toContain(
			'A role, a role hierarchy, and an authenticated principal\n> grant nothing by themselves.',
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
		expect(documentation).not.toMatch(/roles? (?:automatically )?grants?/iu)
		expect(documentation).not.toMatch(
			/Master (?:skips|bypasses) (?:validation|Hooks|transactions)/u,
		)
	})
})

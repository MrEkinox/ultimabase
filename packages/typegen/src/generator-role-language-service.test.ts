import path from 'node:path'

import * as ts from 'typescript'
import { describe, expect, it } from 'vitest'
import {
	createGeneratedRoleRegistry,
	createSourceLanguageService,
} from '../tests/fixtures/generator-language-service.js'

describe('generated RoleSchema TypeScript contracts', () => {
	it('drives generated RoleSchema fields and persisted commands', () => {
		const registry = createGeneratedRoleRegistry()
		expect(registry).not.toContain('ultimabase.roles.identity')
		const source = `${registry}
import { UltimaBase } from '@ultimabase/core'
import { rolesPlugin } from '@ultimabase/roles-plugin'
const RoleApplication = UltimaBase.use(rolesPlugin())
const Member = UltimaBase.Schema.define({
  className: 'SemanticRoleMember',
  fields: (field) => ({
    name: field.string({ required: true }),
  }),
})
const AppRole = RoleApplication.RoleSchema.define({
  className: 'SemanticRole',
  fields: (field) => ({ description: field.string() }),
  members: () => Member,
}).with({})

// @ts-expect-error -- Role schemas are not constructible (ADR-0310).
new AppRole({ description: 'Editors', name: 'editor' })

async function inspectRole() {
  const role = await AppRole.findOne()

  if (role !== null) {
    const description: string | null = role.description
    // Members link through the relation field, not a role command (ADR-0310).
    await AppRole.updateOne({
      where: { id: { eq: role.id } },
      data: { members: { connect: ['member-1'] } },
    })
    // @ts-expect-error -- Results have no role commands.
    role.addMember
    void description
  }
}

void inspectRole
`
		const fileName = path.join(
			import.meta.dirname,
			'generated-role-public-api.semantic.fixture.ts',
		)
		const service = createSourceLanguageService(fileName, source)

		expect(
			service
				.getSemanticDiagnostics(fileName)
				.map(({ messageText }) =>
					ts.flattenDiagnosticMessageText(messageText, '\n'),
				),
		).toStrictEqual([])
	})
})

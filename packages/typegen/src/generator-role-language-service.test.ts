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
import { RoleSchema } from '@ultimabase/roles-plugin'
const Member = UltimaBase.Schema.define({
  className: 'SemanticRoleMember',
  fields: (field) => ({
    name: field.string({ required: true }),
  }),
})
const AppRole = RoleSchema.define({
  className: 'SemanticRole',
  fields: (field) => ({ description: field.string() }),
  members: { schema: Member },
})

const draft = new AppRole({ description: 'Editors', name: 'editor' })
const draftDescription: string | null | undefined = draft.description

async function inspectRole() {
  const role = await AppRole.findOne()

  if (role !== null) {
    const description: string | null = role.description
    await role.addMember(Member.pointer('member-1'))
    void description
  }
}

void draft
void draftDescription
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

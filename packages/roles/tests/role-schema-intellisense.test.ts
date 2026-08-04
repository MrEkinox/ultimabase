import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'
import * as ts from 'typescript'

import { createLanguageService } from '../../../tooling/vitest/typescript-language-service.js'

const packageDirectory = path.dirname(fileURLToPath(import.meta.url))
const fixtureFile = path.join(packageDirectory, 'role-schema-intellisense.fixture.ts')
const source = `
import { Schema, stringField } from '@ultimabase/core'
import { RoleSchema } from '../src/index.js'

const User = Schema.define({ className: 'User', fields: {} })
const AppRole = RoleSchema.define({
  className: 'Role',
  members: { schema: User },
  fields: { description: stringField() },
})

AppRole./* role-hover */role('editor')
RoleSchema.define({ /* options-complete */ })
async function inspectMemberCommand() {
  const role = await AppRole.query().first()
  role?./* member-hover */addMember(User.pointer('member-id'))
}
`

const service = createLanguageService(fixtureFile, source)

const markerPosition = (marker: string): number => {
	const position = source.indexOf(marker)

	if (position < 0) {
		throw new TypeError(`Missing IntelliSense marker: ${marker}`)
	}

	return position
}

describe('RoleSchema IntelliSense', () => {
	it('documents the compact static role-reference helper', () => {
		const marker = '/* role-hover */'
		const quickInfo = service.getQuickInfoAtPosition(
			fixtureFile,
			markerPosition(marker) + marker.length,
		)
		const documentation = ts.displayPartsToString(quickInfo?.documentation)

		expect(documentation).toContain('Creates a normalized name reference')
	})

	it('suggests the complete top-level declaration shape', () => {
		const completions = service.getCompletionsAtPosition(
			fixtureFile,
			markerPosition('/* options-complete */'),
			{},
		)
		const names = completions?.entries.map(({ name }) => name) ?? []

		expect(names).toEqual(
			expect.arrayContaining([
				'access',
				'className',
				'extensions',
				'fields',
				'hooks',
				'indexes',
				'members',
			]),
		)
	})

	it('documents persisted member commands at their call site', () => {
		const marker = '/* member-hover */'
		const quickInfo = service.getQuickInfoAtPosition(
			fixtureFile,
			markerPosition(marker) + marker.length,
		)
		const documentation = ts.displayPartsToString(quickInfo?.documentation)

		expect(documentation).toContain('Adds one exact persisted member')
	})
})

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'
import * as ts from 'typescript'

import { createLanguageService } from '../../../tooling/vitest/typescript-language-service.js'

const packageDirectory = path.dirname(fileURLToPath(import.meta.url))
const fixtureFile = path.join(
	packageDirectory,
	'role-schema-intellisense.fixture.ts',
)
const source = `
import { Schema, stringField } from '@ultimabase/core'
import { RoleSchema, hasRole } from '../src/index.js'

const User = Schema.define({ className: 'User', fields: () => ({}) })
const AppRole = RoleSchema.define({
  className: 'Role',
  members: { schema: User },
  fields: () => ({ description: stringField() }),
  deletion: { /* deletion-hover */references: 'fail' },
})

RoleSchema.define({
  className: 'CompletedRole',
  members: { schema: User },
  fields: () => ({}),
  deletion: { /* deletion-complete */ },
})

AppRole./* role-hover */role('editor')
void /* access-hover */hasRole(AppRole.role('editor'))
RoleSchema.define({ /* options-complete */ })
async function inspectMemberCommand() {
  const role = await AppRole.findOne()
  role?./* member-hover */addMember(User.pointer('member-id'))
  role?./* hierarchy-hover */addRole(AppRole.pointer('role-id'))
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

	it('documents the compact native Access decision helper', () => {
		const marker = '/* access-hover */'
		const quickInfo = service.getQuickInfoAtPosition(
			fixtureFile,
			markerPosition(marker) + marker.length,
		)
		const documentation = ts.displayPartsToString(quickInfo?.documentation)

		expect(documentation).toContain('Creates one native Access decision')
		expect(documentation).toContain('accessRoleResolverCapability')
		expect(documentation).toContain('PLUGIN_CAPABILITY_MISSING')
	})

	it('keeps current role documentation free of removed service terminology', () => {
		const publicDocumentation = [
			readFileSync(path.join(packageDirectory, '../README.md'), 'utf8'),
			readFileSync(
				path.join(packageDirectory, '../src/role-access.ts'),
				'utf8',
			),
		].join('\n')

		expect(publicDocumentation).toContain('accessRoleResolverCapability')
		expect(publicDocumentation).toContain('PLUGIN_CAPABILITY_MISSING')
		expect(publicDocumentation).not.toMatch(
			/neutral (?:application )?service/iu,
		)
		expect(publicDocumentation).not.toContain('SERVICE_NOT_FOUND')
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
				'deletion',
				'extensions',
				'fields',
				'indexes',
				'members',
			]),
		)
	})

	it('documents and completes schema-owned deletion policy options', () => {
		const completions = service.getCompletionsAtPosition(
			fixtureFile,
			markerPosition('/* deletion-complete */'),
			{},
		)
		const names = completions?.entries.map(({ name }) => name) ?? []
		const marker = '/* deletion-hover */'
		const quickInfo = service.getQuickInfoAtPosition(
			fixtureFile,
			markerPosition(marker) + marker.length,
		)

		expect(names).toContain('references')
		expect(ts.displayPartsToString(quickInfo?.documentation)).toContain(
			'Controls references registered by independent consumer plugins',
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

	it('documents hierarchy direction at the nested-role call site', () => {
		const marker = '/* hierarchy-hover */'
		const quickInfo = service.getQuickInfoAtPosition(
			fixtureFile,
			markerPosition(marker) + marker.length,
		)
		const documentation = ts.displayPartsToString(quickInfo?.documentation)

		expect(documentation).toContain('Makes the supplied role a child')
	})
})

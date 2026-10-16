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
import { accessPlugin } from '@ultimabase/access-plugin'
import { UltimaBase } from '@ultimabase/core'
import { hasRole, rolesPlugin } from '../src/index.js'

const RoleApplication = UltimaBase.use(accessPlugin()).use(rolesPlugin())
const User = RoleApplication.Schema.define({ className: 'User', fields: () => ({}) })
const AppRole = RoleApplication.RoleSchema.define({
  className: 'Role',
  members: () => User,
  fields: (field) => ({ description: field.string() }),
  /* deletion-hover */deletion: 'fail',
}).with((plugins) => plugins.access({ read: true }))

RoleApplication.RoleSchema.define({
  className: 'CompletedRole',
  members: () => User,
  deletion: '/* deletion-complete */',
})

AppRole./* role-hover */role('editor')
void /* access-hover */hasRole(AppRole.role('editor'))
RoleApplication.RoleSchema.define({ /* options-complete */ })
async function inspectRoleResult() {
  const role = await AppRole.findOne()
  role?./* result-complete */name
  await AppRole.updateOne({
    where: { id: 'role-id' },
    data: { members: { /* members-complete */connect: ['member-id'] } },
  })
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

	it('documents the compact role policy predicate', () => {
		const marker = '/* access-hover */'
		const quickInfo = service.getQuickInfoAtPosition(
			fixtureFile,
			markerPosition(marker) + marker.length,
		)
		const documentation = ts.displayPartsToString(quickInfo?.documentation)

		expect(documentation).toContain('Returns a policy predicate')
		expect(documentation).toContain('requestRoleResolverCapability')
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

		expect(publicDocumentation).toContain('requestRoleResolverCapability')
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
				'className',
				'deletion',
				'ensure',
				'fields',
				'members',
				'resolveCurrent',
			]),
		)
		// Rules go in the final `.with(...)` (ADR-0322); indexes in define (ADR-0339).
		expect(names).not.toContain('access')
		expect(names).toContain('indexes')
		expect(names).not.toContain('extensions')
		expect(names).not.toContain('ultimabase.roles.identity')
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

		expect(names).toEqual(
			expect.arrayContaining(['cascade', 'fail', 'preserve']),
		)
		expect(ts.displayPartsToString(quickInfo?.documentation)).toContain(
			'Controls references registered by independent consumer plugins',
		)
	})

	// ADR-0310: results carry no role commands; members link through `connect`.
	it('offers role fields, not member commands, on a role result', () => {
		const completions = service.getCompletionsAtPosition(
			fixtureFile,
			markerPosition('/* result-complete */') + '/* result-complete */'.length,
			{},
		)
		const names = completions?.entries.map(({ name }) => name) ?? []

		expect(names).toContain('name')
		expect(names).not.toContain('addMember')
		expect(names).not.toContain('addRole')
	})

	it('links members through the relation update input', () => {
		const completions = service.getCompletionsAtPosition(
			fixtureFile,
			markerPosition('/* members-complete */'),
			{},
		)
		const names = completions?.entries.map(({ name }) => name) ?? []

		expect(names).toEqual(expect.arrayContaining(['disconnect', 'set']))
	})

	it('preserves the same contract through packed package exports', () => {
		const builtSource = source.replace(
			"'../src/index.js'",
			"'@ultimabase/roles-plugin'",
		)
		const builtService = createLanguageService(
			path.join(packageDirectory, 'role-schema-built.virtual.ts'),
			builtSource,
		)

		try {
			const marker = '/* role-hover */'
			const quickInfo = builtService.getQuickInfoAtPosition(
				path.join(packageDirectory, 'role-schema-built.virtual.ts'),
				builtSource.indexOf(marker) + marker.length,
			)

			expect(ts.displayPartsToString(quickInfo?.documentation)).toContain(
				'Creates a normalized name reference',
			)
			const completions = builtService.getCompletionsAtPosition(
				path.join(packageDirectory, 'role-schema-built.virtual.ts'),
				builtSource.indexOf('/* options-complete */'),
				{},
			)

			expect(completions?.entries.map(({ name }) => name)).toEqual(
				expect.arrayContaining(['className', 'fields', 'members']),
			)
		} finally {
			builtService.dispose()
		}
	})
})

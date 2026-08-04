import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'
import * as ts from 'typescript'

import { createLanguageService } from '../../../tooling/vitest/typescript-language-service.js'

const packageDirectory = path.dirname(fileURLToPath(import.meta.url))
const fixtureFile = path.join(packageDirectory, 'acl-intellisense.fixture.ts')
const source = `
import { ACL } from '@ultimabase/acl-permissions-plugin'

const acl = new ACL()

acl./* methods-complete */
void acl.grantPrincipal/* principal-hover */
void acl.revokeRole/* role-hover */
acl.grantPublic(/* permission-complete */)
const /* acl-hover */value = acl.grantPublic('read')
`
// Replacing markers with equal-width spaces makes the fixture match real editor input.
const serviceSource = source.replace(/\/\* [^*]+ \*\//g, (marker) =>
	' '.repeat(marker.length),
)
const service = createLanguageService(fixtureFile, serviceSource)

const markerPosition = (marker: string): number => {
	const position = source.indexOf(marker)

	if (position < 0) {
		throw new TypeError(`Missing ACL IntelliSense marker: ${marker}`)
	}

	return position
}

describe('ACL IntelliSense', () => {
	it('suggests the complete immutable builder and inspection surface', () => {
		const marker = '/* methods-complete */'
		const completions = service.getCompletionsAtPosition(
			fixtureFile,
			markerPosition(marker) + marker.length,
			{},
		)
		const names = completions?.entries.map(({ name }) => name) ?? []

		expect(names).toEqual(
			expect.arrayContaining([
				'grantPublic',
				'grantAuthenticated',
				'grantPrincipal',
				'grantRole',
				'revokePrincipal',
				'setRolePermissions',
				'permissionsForPrincipal',
				'hasRolePermission',
			]),
		)
	})

	it('documents principal and role modifiers at their call sites', () => {
		const principalMarker = '/* principal-hover */'
		const principal = service.getQuickInfoAtPosition(
			fixtureFile,
			markerPosition(principalMarker) - 1,
		)
		const roleMarker = '/* role-hover */'
		const role = service.getQuickInfoAtPosition(
			fixtureFile,
			markerPosition(roleMarker) - 1,
		)
		expect(ts.displayPartsToString(principal?.documentation)).toContain(
			'Adds rights for one exact schema-qualified principal Pointer',
		)
		expect(ts.displayPartsToString(role?.documentation)).toContain(
			'Removes only the supplied rights from one neutral role subject',
		)
	})

	it('completes the closed right vocabulary', () => {
		const marker = '/* permission-complete */'
		const completions = service.getCompletionsAtPosition(
			fixtureFile,
			markerPosition(marker),
			{ includeCompletionsWithInsertText: true },
		)
		const names =
			completions?.entries.map(({ name }) =>
				// TypeScript renders contextual string literals with quotes in completion names.
				name.replace(/^['"]|['"]$/g, ''),
			) ?? []

		expect(names).toEqual(
			expect.arrayContaining(['read', 'update', 'delete', 'manageAcl']),
		)
	})

	it('keeps the chained result hover at the public ACL class', () => {
		const marker = '/* acl-hover */'
		const quickInfo = service.getQuickInfoAtPosition(
			fixtureFile,
			markerPosition(marker) + marker.length,
		)
		const display = ts.displayPartsToString(quickInfo?.displayParts)

		expect(display).toContain('const value: ACL')
		expect(display).not.toContain('ACLState')
		expect(display).not.toContain('WeakMap')
	})
})

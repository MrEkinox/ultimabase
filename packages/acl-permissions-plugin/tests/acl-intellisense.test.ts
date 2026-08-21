import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'
import * as ts from 'typescript'

import { createLanguageService } from '../../../tooling/vitest/typescript-language-service.js'

const packageDirectory = path.dirname(fileURLToPath(import.meta.url))
const fixtureFile = path.join(packageDirectory, 'acl-intellisense.fixture.ts')
const source = `
import { ACL, aclPlugin, onACLChange } from '@ultimabase/acl-permissions-plugin'
import type { ACLSchemaOption } from '@ultimabase/acl-permissions-plugin'
import { Schema, stringField } from '@ultimabase/core'

declare module '@ultimabase/core' {
  interface UltimaBaseGeneratedSchemaOptions {
    readonly acl?: ACLSchemaOption<this>
  }
}

const acl = new ACL()

acl./* methods-complete */
void acl.grantPrincipal/* principal-hover */
void acl.revokeRole/* role-hover */
void acl.toJSON/* to-json-hover */
void ACL.fromJSON/* from-json-hover */
acl.grantPublic(/* permission-complete */)
const /* acl-hover */value = acl.grantPublic('read')
const /* json-hover */document = acl.toJSON()
void ({} as ACLSchemaOption/* option-hover */<unknown>)
const directACL: ACLSchemaOption<unknown> = { /* options-complete */ }
void directACL
Schema.define({ /* schema-option-complete */ })
void aclPlugin/* plugin-hover */
aclPlugin({ /* plugin-options-complete */ })
aclPlugin({ limits: { /* plugin-limits-complete */ } })
aclPlugin({ limits: { maxPrincipals/* principal-limit-hover */: 100 } })
void onACLChange/* event-hover */
onACLChange(({ event }) => {
	const /* event-payload-hover */payload = event.payload
	payload./* event-payload-complete */
})

const ContextualPost = Schema.define({
	className: 'ContextualPost',
	fields: () => ({
		title: stringField({ validation: { required: true } }),
		visibility: stringField(),
	}),
	acl: {
			default: ({ data }) => {
				data./* schema-data-complete */
				const /* schema-title-hover */title = data.title
				const /* schema-visibility-hover */visibility = data.visibility

				return new ACL()
			},
			resolveInput: (input) => {
				const /* schema-input-hover */candidate = input.data

				return input.inputAcl ?? input.currentAcl
			},
		limits: { /* schema-limits-complete */ },
	},
})

void ContextualPost
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

		expect(names).toEqual(expect.arrayContaining(['read', 'update', 'delete']))
		expect(names).not.toContain('manageAcl')
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

	it('documents compact JSON conversion in both directions', () => {
		const toJSONMarker = '/* to-json-hover */'
		const toJSON = service.getQuickInfoAtPosition(
			fixtureFile,
			markerPosition(toJSONMarker) - 1,
		)
		const fromJSONMarker = '/* from-json-hover */'
		const fromJSON = service.getQuickInfoAtPosition(
			fixtureFile,
			markerPosition(fromJSONMarker) - 1,
		)
		const documentMarker = '/* json-hover */'
		const document = service.getQuickInfoAtPosition(
			fixtureFile,
			markerPosition(documentMarker) + documentMarker.length,
		)

		expect(ts.displayPartsToString(toJSON?.documentation)).toContain(
			'Returns one deeply detached canonical JSON snapshot',
		)
		expect(ts.displayPartsToString(fromJSON?.documentation)).toContain(
			'Reconstructs one canonical ACL',
		)
		expect(ts.displayPartsToString(document?.displayParts)).toContain(
			'const document: ACLJSON',
		)
	})

	it('documents the direct schema option and completes its focused options', () => {
		const hoverMarker = '/* option-hover */'
		const hover = service.getQuickInfoAtPosition(
			fixtureFile,
			markerPosition(hoverMarker) - 1,
		)
		const optionsMarker = '/* options-complete */'
		const completions = service.getCompletionsAtPosition(
			fixtureFile,
			markerPosition(optionsMarker) + optionsMarker.length,
			{},
		)
		const names = completions?.entries.map(({ name }) => name) ?? []
		const schemaMarker = '/* schema-option-complete */'
		const schemaCompletions = service.getCompletionsAtPosition(
			fixtureFile,
			markerPosition(schemaMarker),
			{},
		)

		expect(ts.displayPartsToString(hover?.documentation)).toContain(
			'Configures ACL generation and accepted input from exact sibling fields',
		)
		expect(names).toEqual(
			expect.arrayContaining(['default', 'limits', 'resolveInput']),
		)
		expect(schemaCompletions?.entries.map(({ name }) => name) ?? []).toContain(
			'acl',
		)

		const limitsMarker = '/* schema-limits-complete */'
		const limitCompletions = service.getCompletionsAtPosition(
			fixtureFile,
			markerPosition(limitsMarker),
			{},
		)
		expect(limitCompletions?.entries.map(({ name }) => name) ?? []).toEqual(
			expect.arrayContaining(['maxPrincipals', 'maxRoles']),
		)
	})

	it('documents plugin defaults and completes every limit option', () => {
		const hoverMarker = '/* plugin-hover */'
		const hover = service.getQuickInfoAtPosition(
			fixtureFile,
			markerPosition(hoverMarker) - 1,
		)
		const optionsMarker = '/* plugin-options-complete */'
		const optionCompletions = service.getCompletionsAtPosition(
			fixtureFile,
			markerPosition(optionsMarker),
			{},
		)
		const limitsMarker = '/* plugin-limits-complete */'
		const limitCompletions = service.getCompletionsAtPosition(
			fixtureFile,
			markerPosition(limitsMarker),
			{},
		)
		const principalMarker = '/* principal-limit-hover */'
		const principal = service.getQuickInfoAtPosition(
			fixtureFile,
			markerPosition(principalMarker) - 1,
		)

		expect(ts.displayPartsToString(hover?.documentation)).toContain(
			'default to 100 exact principals and 50 roles',
		)
		expect(optionCompletions?.entries.map(({ name }) => name) ?? []).toEqual(
			expect.arrayContaining(['limits']),
		)
		expect(limitCompletions?.entries.map(({ name }) => name) ?? []).toEqual(
			expect.arrayContaining(['maxPrincipals', 'maxRoles']),
		)
		expect(ts.displayPartsToString(principal?.documentation)).toContain(
			'Limits exact principal entries after duplicate grants have been merged',
		)
	})

	it('documents committed event consumers and exposes a compact payload', () => {
		const hoverMarker = '/* event-hover */'
		const hover = service.getQuickInfoAtPosition(
			fixtureFile,
			markerPosition(hoverMarker) - 1,
		)
		const payloadMarker = '/* event-payload-hover */'
		const payload = service.getQuickInfoAtPosition(
			fixtureFile,
			markerPosition(payloadMarker) + payloadMarker.length,
		)
		const completionMarker = '/* event-payload-complete */'
		const completions = service.getCompletionsAtPosition(
			fixtureFile,
			markerPosition(completionMarker) + completionMarker.length,
			{},
		)

		expect(ts.displayPartsToString(hover?.documentation)).toContain(
			'precisely typed consumer for committed ACL change events',
		)
		expect(ts.displayPartsToString(payload?.displayParts)).toContain(
			'const payload: ACLChangedEvent',
		)
		expect(completions?.entries.map(({ name }) => name) ?? []).toEqual(
			expect.arrayContaining(['actor', 'diff', 'operation', 'target']),
		)
	})
})

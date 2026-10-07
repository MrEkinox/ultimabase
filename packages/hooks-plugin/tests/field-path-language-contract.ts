import ts from 'typescript'
import { expect } from 'vitest'

import { createLanguageService } from '../../../tooling/vitest/typescript-language-service.js'

/** Checks the same path contract through source and compiled package exports. */
export const assertFieldPathLanguageContract = (
	fileName: string,
	hooksModule: string,
): void => {
	const source = `
import { objectField, stringField, definePluginField, type GenericField, type SchemaDefinition } from '@ultimabase/core'
import type { FieldAtPath, SchemaFieldPath } from '${hooksModule}'
const email = stringField({ required: true, list: true })
const custom = definePluginField('fixture.path-value', {}, { snapshotValue: (value) => value })
const fields = {
  profile: objectField({ fields: { email }, list: true }),
  'profile.email': stringField(),
  title: stringField(),
  custom,
}
type PathSchema = SchemaDefinition<'PathContract', typeof fields>
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false
const nested: SchemaFieldPath<PathSchema> = ['profile', 'email']
const dotted: SchemaFieldPath<PathSchema> = ['profile.email']
const system: SchemaFieldPath<PathSchema> = ['id']
const exact: Equal<FieldAtPath<PathSchema, readonly ['profile', 'email']>, typeof email> = true
const pluginKind: Equal<FieldAtPath<PathSchema, readonly ['custom']>, typeof custom> = true
const missing: Equal<FieldAtPath<PathSchema, readonly ['missing']>, never> = true
const wide: Equal<FieldAtPath<SchemaDefinition, readonly ['unknown']>, GenericField> = true
const widePath: SchemaFieldPath<SchemaDefinition> = ['unknown', 'nested']
// @ts-expect-error -- Paths are non-empty even for widened schemas.
const empty: SchemaFieldPath<SchemaDefinition> = []
// @ts-expect-error -- Unknown field names remain rejected.
const invalid: SchemaFieldPath<PathSchema> = ['missing']
// @ts-expect-error -- Scalar fields cannot be traversed.
const scalar: SchemaFieldPath<PathSchema> = ['title', 'nested']
type Node = GenericField & { readonly kind: 'object'; readonly options: { readonly fields: { readonly next: Node } } }
type DeepSchema = SchemaDefinition<'DeepPathContract', { readonly root: Node }>
const atLimit: SchemaFieldPath<DeepSchema> = ${JSON.stringify(['root', ...Array<string>(15).fill('next')])}
// @ts-expect-error -- The established depth budget rejects a seventeenth segment.
const beyondLimit: SchemaFieldPath<DeepSchema> = ${JSON.stringify(['root', ...Array<string>(16).fill('next')])}
`
	const service = createLanguageService(fileName, source)
	expect(
		service
			.getSemanticDiagnostics(fileName)
			.map(({ messageText }) =>
				ts.flattenDiagnosticMessageText(messageText, '\n'),
			),
	).toEqual([])
	for (const [name, documentation] of [
		['SchemaFieldPath', 'Lists every non-empty field path'],
		['FieldAtPath', 'Resolves the exact field definition'],
	] as const) {
		const hover = service.getQuickInfoAtPosition(fileName, source.indexOf(name))
		expect(ts.displayPartsToString(hover?.documentation)).toContain(
			documentation,
		)
	}
	service.dispose()

	for (const [expression, expected] of [
		["['']", ['id', 'profile', 'profile.email', 'title', 'custom']],
		["['profile', '']", ['email']],
	] as const) {
		const completionSource = `${source}\nconst completion: SchemaFieldPath<PathSchema> = ${expression}`
		const completionService = createLanguageService(fileName, completionSource)
		const position = completionSource.lastIndexOf("''") + 1
		const names = completionService
			.getCompletionsAtPosition(fileName, position, {})
			?.entries.map(({ name }) => name)
		expect(names).toEqual(expect.arrayContaining([...expected]))
		completionService.dispose()
	}
}

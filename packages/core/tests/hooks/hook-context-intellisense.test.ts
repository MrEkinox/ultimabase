import * as ts from 'typescript'
import { describe, expect, it } from 'vitest'

import { createLanguageService } from '../../../../tooling/vitest/typescript-language-service.js'

const fileName = `${import.meta.dirname}/hook-context-intellisense.fixture.ts`
const completionMarker = '/* completion:hook-context */'
const sourceWithMarkers = `
import { RequestContextValue, Schema, stringField, type HookContext } from '../../src/index.js'

const principal = new RequestContextValue<string>('fixture.principal', (value) => {
  if (typeof value !== 'string') throw new TypeError('Expected a string')
  return value
})

const AuditSchema = Schema.define({
  className: 'HookContextIntelliSenseAudit',
  fields: {
    action: stringField({ validation: { required: true } }),
    secret: stringField(),
  },
})

declare const context: HookContext

context.${completionMarker}emit('audit.checked', { id: 'audit-1' })
const query = AuditSchema./* hover:query-builder */query()
const event = context./* hover:emit-method */emit('audit.created', { id: 'audit-1' })
const principalId = context./* hover:get-value-method */getValue(principal)
const selected = await query.select('id', 'action')./* hover:query-terminal */find()
const /* hover:selected-result */ first = selected[0]
void event
void principalId
void first
`
const completionPosition = sourceWithMarkers.indexOf(completionMarker)
const source = sourceWithMarkers.replace(
	completionMarker,
	' '.repeat(completionMarker.length),
)
const service = createLanguageService(fileName, source)

/** Reads QuickInfo after one marker without coupling assertions to line offsets. */
const readQuickInfo = (marker: string): ts.QuickInfo => {
	let position = source.indexOf(marker)

	if (position < 0) {
		throw new TypeError(`Missing HookContext hover marker: ${marker}`)
	}

	position += marker.length

	while (/\s/u.test(source[position] ?? '')) {
		position += 1
	}

	const quickInfo = service.getQuickInfoAtPosition(fileName, position)

	if (quickInfo === undefined) {
		throw new TypeError(`Missing HookContext QuickInfo: ${marker}`)
	}

	return quickInfo
}

/** Renders the exact editor text used by compact hover assertions. */
const displayQuickInfo = (marker: string): string => {
	const quickInfo = readQuickInfo(marker)

	return ts.displayPartsToString(quickInfo.displayParts)
}

describe('HookContext IntelliSense', () => {
	it('exposes only documented safe capabilities through completion', () => {
		const completions = service.getCompletionsAtPosition(
			fileName,
			completionPosition,
			{},
		)
		const names = completions?.entries.map(({ name }) => name) ?? []

		expect(names).toEqual(
			expect.arrayContaining([
				'access',
				'emit',
				'getValue',
				'hasCapability',
				'hook',
				'requestId',
				'signal',
				'source',
				'transactionId',
			]),
		)
		expect(names).not.toEqual(
			expect.arrayContaining([
				'adapter',
				'commit',
				'metadata',
				'rollback',
				'skipHooks',
				'useMasterKey',
			]),
		)
	})

	it('keeps method and selected-result hovers concise', () => {
		const query = displayQuickInfo('/* hover:query-builder */')
		const emit = displayQuickInfo('/* hover:emit-method */')
		const getValue = displayQuickInfo('/* hover:get-value-method */')
		const selected = displayQuickInfo('/* hover:selected-result */')
		// Persistence commands may mention writable fields without making those
		// fields visible on the selected model value itself.
		const selectedValues = selected.split('get:')[0] ?? ''

		expect(query).toContain('Query<')
		expect(query.length).toBeLessThan(900)
		expect(emit).toContain('void')
		expect(emit.length).toBeLessThan(700)
		expect(getValue).toContain('string | undefined')
		expect(getValue.length).toBeLessThan(700)
		expect(selectedValues).toContain('readonly action: string;')
		expect(selectedValues).toContain('readonly id: string;')
		expect(selectedValues).not.toContain('secret')
		expect(selected).toContain('readonly secret?: string | null;')
		expect(selected.length).toBeLessThan(900)
	})

	it('documents query and event capabilities in editor hovers', () => {
		const query = readQuickInfo('/* hover:query-terminal */')
		const emit = readQuickInfo('/* hover:emit-method */')
		const getValue = readQuickInfo('/* hover:get-value-method */')

		expect(ts.displayPartsToString(query.documentation)).toContain(
			'active request',
		)
		expect(ts.displayPartsToString(emit.documentation)).toContain(
			'after the transaction commits',
		)
		expect(ts.displayPartsToString(getValue.documentation)).toContain(
			'plugin-owned request value',
		)
		expect(query.tags?.some(({ name }) => name === 'example')).toBe(true)
		expect(emit.tags?.some(({ name }) => name === 'example')).toBe(true)
		expect(getValue.tags?.some(({ name }) => name === 'example')).toBe(true)
	})
})

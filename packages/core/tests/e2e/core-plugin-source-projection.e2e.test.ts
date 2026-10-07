import path from 'node:path'
import { describe, expect, it } from 'vitest'

import {
	createPackedCoreLanguageFixture,
	createSourceCoreLanguageFixture,
} from './packed-core-language-service.js'

const repositoryRoot = path.resolve(import.meta.dirname, '../../../..')
const sourceFixtureFile = path.join(
	repositoryRoot,
	'packages/core/tests/runtime/plugin-source-language-service.prototype.ts',
)
const sourceFixture = await createSourceCoreLanguageFixture(sourceFixtureFile)
const packedFixture = await createPackedCoreLanguageFixture(
	sourceFixtureFile,
	'core-plugin-source-projection.packed.fixture.ts',
)

describe.each([
	['source', sourceFixture],
	['packed', packedFixture],
] as const)('%s plugin source projections', (_mode, fixture) => {
	it('keeps installed fields and operations exact without generated declarations', () => {
		expect(fixture.diagnostics()).toStrictEqual([])
		expect(
			fixture.readMemberCompletions('plugin-field').map(({ name }) => name),
		).toEqual(expect.arrayContaining(['importance', 'string']))
		expect(
			fixture.readMemberCompletions('core-field').map(({ name }) => name),
		).not.toContain('importance')
		const value = fixture.readHover('plugin-value')
		expect(value.display).toContain('boolean')
		expect(value.display.length).toBeLessThan(2_000)
		const result = fixture.readHover('plugin-operation-result')
		expect(result.display).toContain('Promise<number>')
		expect(result.display.length).toBeLessThan(2_000)
		const directQuery = fixture.readHover('direct-query')
		expect(directQuery.display).toContain('findMany')
		expect(directQuery.display).toContain('Promise<')
		expect(directQuery.display.length).toBeLessThan(2_000)
		const directCreate = fixture.readHover('direct-create')
		expect(directCreate.display).toContain('create')
		expect(directCreate.display).toContain('Promise<')
		expect(directCreate.display.length).toBeLessThan(2_000)
	})

	it('retains readable selected models and documented immutable commands', () => {
		expect(fixture.diagnostics()).toStrictEqual([])
		const selected = fixture.readHover('selected-model').display
		expect(selected).toContain('readonly title: string')
		expect(selected).toContain('readonly id: string')
		expect(selected).not.toContain('SelectedPersistedSchemaModel')
		expect(selected).not.toContain('readonly important:')
		const fields = fixture
			.readMemberCompletions('selected-fields')
			.map(({ name }) => name)
		expect(fields).toEqual(expect.arrayContaining(['id', 'title', 'update']))
		expect(fields).not.toContain('important')
		const update = fixture.readHover('model-update')
		expect(update.display).toContain('Promise<')
		expect(update.documentation).toContain(
			'Updates this protected object identity',
		)
		expect(update.hasExample).toBe(true)
	})
})

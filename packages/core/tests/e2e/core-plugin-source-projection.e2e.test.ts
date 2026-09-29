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
	})
})

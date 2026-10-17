import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { createPackedCoreLanguageFixture } from './packed-core-language-service.js'

const repositoryRoot = path.resolve(import.meta.dirname, '../../../..')
const languageFixture = await createPackedCoreLanguageFixture(
	path.join(
		repositoryRoot,
		'packages/core/tests/e2e/fixtures/output-builder.prototype.ts',
	),
	'core-output-builder.packed.fixture.ts',
)
const factoryNames = [
	'bigint',
	'binary',
	'boolean',
	'date',
	'dateTime',
	'decimal',
	'enum',
	'float',
	'int',
	'json',
	'object',
	'string',
	'time',
	'uuid',
] as const
const specificOptions: Readonly<Record<string, readonly string[]>> = {
	dateTime: ['timezone'],
	decimal: ['precision', 'scale'],
	enum: ['values'],
	object: ['fields', 'typeName'],
	time: ['timezone'],
}

describe('packed @ultimabase/core OutputBuilder contract', () => {
	it('type-checks exact recursive outputs through package exports', () => {
		expect(languageFixture.diagnostics()).toStrictEqual([])
	}, 20_000)

	it('publishes only the output value factories', () => {
		expect(
			languageFixture
				.readMemberCompletions('output-builder')
				.map(({ name }) => name)
				.sort(),
		).toStrictEqual(factoryNames)
	})

	it('publishes truthful output-only options for every factory', () => {
		for (const factoryName of factoryNames) {
			expect(
				languageFixture
					.readMemberCompletions(
						`output-${factoryName === 'dateTime' ? 'date-time' : factoryName}-options`,
					)
					.map(({ name }) => name)
					.sort(),
				factoryName,
			).toStrictEqual(
				[
					'description',
					'list',
					'required',
					...(specificOptions[factoryName] ?? []),
				].sort(),
			)
		}
	})

	it('keeps every output factory documented in the published declarations', () => {
		for (const completion of languageFixture.readMemberCompletions(
			'output-builder',
		)) {
			expect(completion.documentation, completion.name).not.toBe('')
		}
	})
})

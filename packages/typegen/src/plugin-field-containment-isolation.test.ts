import {
	defineFieldBuilderMethod,
	definePlugin,
	definePluginField,
	FrameworkApplication,
	QueryBuilder,
	Schema,
} from '@ultimabase/core'
import { isPlainRecord } from '@ultimabase/shared'
import { describe, expect, it } from 'vitest'

import { generateApplicationTypes } from './generator.js'

const createFixture = (suffix: 'Alpha' | 'Beta', operandKey: string) => {
	const containedField = () =>
		definePluginField(
			'fixture.isolated.contained',
			{},
			{
				snapshotValue: (value: unknown) => value,
				storageCodec: {
					decode: (value) => value,
					encode: (value) => value,
					format: 'json',
					version: 1,
				},
				structuralContains: {
					snapshotOperand: (value: unknown) => {
						if (!isPlainRecord(value) || value[operandKey] !== true) {
							throw new TypeError(`operand must enable ${operandKey}`)
						}
						return value
					},
				},
			},
		)
	const method = defineFieldBuilderMethod({
		factory: containedField,
		fieldKind: 'fixture.isolated.contained',
		name: 'contained',
		typegen: {
			methodType: `${suffix}FieldBuilderMethod`,
			module: `@fixture/${suffix.toLowerCase()}-plugin`,
			structuralContainsType: `${suffix}ContainsOperand`,
			valueType: `${suffix}Value`,
		},
	})
	const plugin = definePlugin({
		core: '^0.0.0',
		declare: ({ fields }) => {
			fields.register(method)
			return undefined
		},
		pluginId: `fixture.${suffix.toLowerCase()}-plugin`,
		privileges: [
			{ name: 'schema:declare', reason: `Declares ${suffix} fields.` },
		],
		version: '0.0.0',
	})
	const Document = Schema.define({
		className: `Isolated${suffix}Document`,
		fields: () => ({ value: containedField() }),
	})
	const generated = generateApplicationTypes({
		application: new FrameworkApplication({
			plugins: [plugin],
			schemas: [Document],
		}),
		applicationId: `fixture.isolated-${suffix.toLowerCase()}`,
	})

	return { Document, generated }
}

describe('plugin field containment application isolation', () => {
	it('keeps callbacks and operand references within their compiled application', () => {
		const alpha = createFixture('Alpha', 'alpha')
		const beta = createFixture('Beta', 'beta')

		expect(alpha.generated.contents).toContain('Plugin0_AlphaContainsOperand')
		expect(alpha.generated.contents).not.toContain('BetaContainsOperand')
		expect(beta.generated.contents).toContain('Plugin0_BetaContainsOperand')
		expect(beta.generated.contents).not.toContain('AlphaContainsOperand')
		expect(() =>
			new QueryBuilder(alpha.Document).where((where) =>
				where.contains('value', { alpha: true }),
			),
		).not.toThrow()
		expect(() =>
			new QueryBuilder(beta.Document).where((where) =>
				where.contains('value', { alpha: true }),
			),
		).toThrow('operand must enable beta')
	})
})

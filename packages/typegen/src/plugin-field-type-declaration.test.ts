import {
	definePlugin,
	definePluginField,
	definePluginFieldType,
	FrameworkApplication,
	Schema,
} from '@ultimabase/core'
import { describe, expect, it } from 'vitest'

import { generateApplicationTypes } from './generator.js'

describe('plugin field type declarations', () => {
	it('generates a patch-only field value without adding a FieldBuilder method', () => {
		const secretField = definePluginField(
			'fixture.secret',
			{ validation: { required: true } },
			{
				snapshotValue: (value: unknown) => value,
				storageCodec: {
					decode: (value) => value,
					encode: (value) => value,
					format: 'json',
					version: 1,
				},
				structuralContains: {
					snapshotOperand: (value: unknown) => value,
				},
			},
		)
		const secretType = definePluginFieldType({
			fieldKind: 'fixture.secret',
			typegen: {
				module: '@fixture/secret-plugin',
				structuralContainsType: 'SecretContainsOperand',
				valueType: 'SecretValue',
			},
		})
		const plugin = definePlugin({
			core: '^0.0.0',
			declare: ({ fields }) => {
				fields.declareType(secretType)
				return undefined
			},
			pluginId: 'fixture.secret-plugin',
			privileges: [
				{
					name: 'schema:declare',
					reason: 'Declares one patch-only field value contract.',
				},
			],
			version: '0.0.0',
		})
		const Document = Schema.define({
			className: 'TypegenSecretDocument',
			fields: () => ({ secret: secretField }),
		})
		const generated = generateApplicationTypes({
			application: new FrameworkApplication({
				plugins: [plugin],
				schemas: [Document],
			}),
			applicationId: 'fixture.secret',
		})

		expect(generated.snapshot.fieldMethods).toStrictEqual([])
		expect(generated.contents).toContain('Plugin0_SecretValue')
		expect(generated.contents).toContain('Plugin0_SecretContainsOperand')
		expect(generated.contents).not.toContain('SecretFieldBuilderMethod')
	})
})

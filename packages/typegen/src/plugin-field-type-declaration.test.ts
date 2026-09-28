import {
	plugin as createPlugin,
	contributeDeclarations,
	definePluginField,
	definePluginFieldFamily,
	UltimaBase,
	Schema,
} from '@ultimabase/core'
import { describe, expect, it } from 'vitest'

import { generateApplicationTypes } from './generator.js'

describe('plugin field type declarations', () => {
	it('generates a patch-only field value without adding a FieldBuilder method', () => {
		const secretField = definePluginField(
			'fixture.secret',
			{ required: true },
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
		const secretType = definePluginFieldFamily({
			fieldKind: 'fixture.secret',
			typegen: {
				module: '@fixture/secret-plugin',
				structuralContainsType: 'SecretContainsOperand',
				valueType: 'SecretValue',
			},
		})
		const plugin = createPlugin({
			core: '^0.0.0',
			id: 'fixture.secret-plugin',
			permissions: {
				'schema:declare': 'Declares one patch-only field value contract.',
			},
			version: '0.0.0',
			contributions: [
				contributeDeclarations({
					schema: ({ fields }) => {
						fields.register(secretType)
						return undefined
					},
				}),
			],
		})
		const Document = Schema.define({
			className: 'TypegenSecretDocument',
			fields: () => ({ secret: secretField }),
		})
		const generated = generateApplicationTypes({
			ultimabase: new UltimaBase({
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

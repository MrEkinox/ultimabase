import {
	definePluginFieldFamily,
	plugin as createPlugin,
	contributeDeclarations,
	definePluginField,
	FrameworkApplication,
	Schema,
} from '@ultimabase/core'
import { describe, expect, it } from 'vitest'

import { generateApplicationTypes } from './generator.js'

describe('portable plugin field filters', () => {
	it('renders exact equality filters for portable plugin scalar values', () => {
		const portableField = () =>
			definePluginField(
				'fixture.portable-value',
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
		const method = definePluginFieldFamily({
			fieldKind: 'fixture.portable-value',
			typegen: {
				module: '@fixture/portable-plugin',
				structuralContainsType: 'PortableContainsOperand',
				valueType: 'PortableValue',
			},
			builder: {
				name: 'portableValue',
				contexts: {
					stored: {
						factory: portableField,
						methodType: 'PortableFieldBuilderMethod',
					},
				},
			},
		})
		const plugin = createPlugin({
			core: '^0.0.0',
			id: 'fixture.portable-plugin',
			permissions: { 'schema:declare': 'Declares the portable field.' },
			version: '0.0.0',
			contributions: [
				contributeDeclarations({
					schema: ({ fields }) => {
						fields.register(method)
						return undefined
					},
				}),
			],
		})
		const Portable = Schema.define({
			className: 'TypegenPortablePluginField',
			fields: (field) => ({
				nested: field.object({ fields: () => ({ value: portableField() }) }),
				value: portableField(),
			}),
		})
		const generated = generateApplicationTypes({
			application: new FrameworkApplication({
				plugins: [plugin],
				schemas: [Portable],
			}),
			applicationId: 'fixture.portable',
		})
		const field = generated.snapshot.schemas[0]?.fields.find(
			({ name }) => name === 'value',
		)

		expect(field?.portableEquality).toBe(true)
		expect(field?.structuralContains).toStrictEqual({
			exportName: 'PortableContainsOperand',
			module: '@fixture/portable-plugin',
		})
		expect(generated.contents).toContain(
			'export type PortableEqualityFilter<TValue>',
		)
		expect(generated.contents).toContain(
			'export type PortableContainmentFilter<TValue, TOperand>',
		)
		expect(generated.contents).toContain(
			'readonly value?: PortableContainmentFilter<Plugin0_PortableValue, Plugin0_PortableContainsOperand>',
		)
		expect(generated.contents).toContain(
			'readonly path: readonly ["value"] } & PortableContainmentFilter<Plugin0_PortableValue, Plugin0_PortableContainsOperand>',
		)
		expect(generated.contents).not.toContain('readonly value?: NullFilter')
		expect(JSON.stringify(generated.snapshot)).not.toContain('snapshotOperand')
	})
})

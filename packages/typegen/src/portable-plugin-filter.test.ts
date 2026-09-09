import {
	defineFieldBuilderMethod,
	definePlugin,
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
		const method = defineFieldBuilderMethod({
			name: 'portableValue',
			contexts: {
				stored: {
					factory: portableField,
					fieldKind: 'fixture.portable-value',
					typegen: {
						methodType: 'PortableFieldBuilderMethod',
						module: '@fixture/portable-plugin',
						structuralContainsType: 'PortableContainsOperand',
						valueType: 'PortableValue',
					},
				},
			},
		})
		const plugin = definePlugin({
			core: '^0.0.0',
			declare: ({ fields }) => {
				fields.register(method)
				return undefined
			},
			pluginId: 'fixture.portable-plugin',
			privileges: [
				{ name: 'schema:declare', reason: 'Declares the portable field.' },
			],
			version: '0.0.0',
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

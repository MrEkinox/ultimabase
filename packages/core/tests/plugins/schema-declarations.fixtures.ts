import type { GenericField } from '../../src/index.js'
import {
	plugin as createPlugin,
	contributeDeclarations,
	defineFieldOption,
	defineSchemaOption,
	type FieldOptionDefinition,
	type PluginDefinition,
	type SchemaOptionDefinition,
} from '../../src/plugin.js'
import { isPlainRecord } from '@ultimabase/shared'
import { snapshotJsonValue } from '../../src/schema/fields/builtins/json.js'

export const jsonObjectOption: SchemaOptionDefinition = defineSchemaOption({
	normalize: (value, path) => {
		if (!isPlainRecord(value)) {
			throw new TypeError(`${path} must be an object`)
		}

		return snapshotJsonValue(value, path)
	},
	protocolVersion: 1,
})

export const jsonObjectFieldOption: FieldOptionDefinition = defineFieldOption({
	contexts: ['stored', 'embedded'],
	normalize: jsonObjectOption.normalize,
	protocolVersion: 1,
})

export const requireField = (field: GenericField | undefined): GenericField => {
	if (field === undefined) throw new TypeError('Expected schema field')
	return field
}

export const optionPlugin = (
	pluginId = 'fixture.schema-options',
): PluginDefinition =>
	createPlugin({
		core: '^0.0.0',
		id: pluginId,
		permissions: { 'schema:declare': 'Declares direct test options.' },
		version: '1.2.3',
		contributions: [
			contributeDeclarations({
				schema: ({ schemas }) => {
					schemas.defineOptions({
						contributionId: 'fixture-options',
						field: { search: jsonObjectFieldOption },
						schema: { workflow: jsonObjectOption },
					})

					return undefined
				},
			}),
		],
	})

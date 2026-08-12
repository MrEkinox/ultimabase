import {
	definePlugin,
	defineSchemaOption,
	type GenericField,
	type PluginDefinition,
	type SchemaOptionDefinition,
} from '../../src/index.js'
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
	typegen: {
		module: '@fixture/schema-options-plugin',
		type: 'FixtureOption',
	},
})

export const requireField = (field: GenericField | undefined): GenericField => {
	if (field === undefined) throw new TypeError('Expected schema field')
	return field
}

export const optionPlugin = (
	pluginId = 'fixture.schema-options',
): PluginDefinition =>
	definePlugin({
		core: '^0.0.0',
		pluginId,
		privileges: [
			{
				name: 'schema:declare',
				reason: 'Declares direct test options.',
			},
		] as const,
		version: '1.2.3',
		declare: ({ schemas }) => {
			schemas.defineOptions({
				contributionId: 'fixture-options',
				field: { search: jsonObjectOption },
				schema: { workflow: jsonObjectOption },
			})
		},
	})

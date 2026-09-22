import { describe, expect, it } from 'vitest'
import {
	Schema,
	createApplication,
	definePlugin,
	type SchemaOptions,
} from '../index.js'
import {
	jsonObjectFieldOption,
	jsonObjectOption,
	optionPlugin,
} from '../../tests/plugins/schema-declarations.fixtures.js'

describe('plugin schema option ownership rejection', () => {
	it('rejects an actually used option when no exact owner can be selected', async () => {
		const Ambiguous = Schema.define({
			className: 'AmbiguousOptionOwner',
			fields: (field) => ({ title: field.string() }),
			workflow: { enabled: true },
		} as SchemaOptions<'AmbiguousOptionOwner'> & {
			readonly workflow: Readonly<{ readonly enabled: boolean }>
		})

		await expect(
			createApplication({
				pluginPrivileges: { logger: false },
				plugins: [
					optionPlugin('fixture.first-options'),
					optionPlugin('fixture.second-options'),
				],
				schemas: [Ambiguous],
			}),
		).rejects.toMatchObject({
			code: 'PLUGIN_DECLARATION_INVALID',
			cause: {
				message:
					'Ambiguous schema option owner for "workflow": fixture.first-options and fixture.second-options',
			},
		})
	})

	it('rejects plugin option names reserved by Core contracts', async () => {
		const schemaCollision = definePlugin({
			core: '^0.0.0',
			pluginId: 'fixture.schema-option-collision',
			privileges: [
				{
					name: 'schema:declare',
					reason: 'Exercises Core schema option collision rejection.',
				},
			] as const,
			version: '1.0.0',
			declare: ({ schemas }) => {
				schemas.defineOptions({
					contributionId: 'collision',
					schema: { fields: jsonObjectOption },
				})
			},
		})
		const fieldCollision = definePlugin({
			core: '^0.0.0',
			pluginId: 'fixture.field-option-collision',
			privileges: [
				{
					name: 'schema:declare',
					reason: 'Exercises Core field option collision rejection.',
				},
			] as const,
			version: '1.0.0',
			declare: ({ schemas }) => {
				schemas.defineOptions({
					contributionId: 'collision',
					field: { required: jsonObjectFieldOption },
				})
			},
		})

		await expect(
			createApplication({ plugins: [schemaCollision], schemas: [] }),
		).rejects.toThrow(
			'Plugin option collides with Core-owned schema option: fields',
		)
		await expect(
			createApplication({ plugins: [fieldCollision], schemas: [] }),
		).rejects.toThrow(
			'Plugin option collides with Core-owned field option: required',
		)
	})
})

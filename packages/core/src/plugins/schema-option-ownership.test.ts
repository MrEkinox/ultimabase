import { describe, expect, it } from 'vitest'
import { createApplication } from '../application/framework-application.js'
import type { FieldBuilder } from '../index.js'
import { plugin as createPlugin, contributeDeclarations } from '../plugin.js'
import {
	jsonObjectFieldOption,
	jsonObjectOption,
	optionPlugin,
} from '../../tests/plugins/schema-declarations.fixtures.js'
import { UltimaBase } from '../runtime/application/ultima-base.js'

describe('plugin schema option ownership rejection', () => {
	it('rejects an actually used option when no exact owner can be selected', async () => {
		// Two independently configured owners are deliberately ambiguous here;
		// Runtime must reject this untrusted schema option.
		const Ambiguous = UltimaBase.Schema.define({
			className: 'AmbiguousOptionOwner',
			fields: (field: FieldBuilder) => ({ title: field.string() }),
			workflow: { enabled: true },
		} as never)

		await expect(
			createApplication({
				logger: false,
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
		const schemaCollision = createPlugin({
			core: '^0.0.0',
			id: 'fixture.schema-option-collision',
			permissions: {
				'schema:declare': 'Exercises Core schema option collision rejection.',
			},
			version: '1.0.0',
			contributions: [
				contributeDeclarations({
					schema: ({ schemas }) => {
						schemas.defineOptions({
							contributionId: 'collision',
							schema: { fields: jsonObjectOption },
						})

						return undefined
					},
				}),
			],
		})
		const fieldCollision = createPlugin({
			core: '^0.0.0',
			id: 'fixture.field-option-collision',
			permissions: {
				'schema:declare': 'Exercises Core field option collision rejection.',
			},
			version: '1.0.0',
			contributions: [
				contributeDeclarations({
					schema: ({ schemas }) => {
						schemas.defineOptions({
							contributionId: 'collision',
							field: { required: jsonObjectFieldOption },
						})

						return undefined
					},
				}),
			],
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

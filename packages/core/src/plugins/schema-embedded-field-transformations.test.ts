import { describe, expect, it } from 'vitest'
import { immutableRecord } from '@ultimabase/shared'

import {
	FrameworkApplication,
	FrameworkError,
	Schema,
	addSchemaField,
	definePlugin,
	objectField,
	stringField,
} from '../index.js'
import { replaceDeclaredFieldOptions } from '../schema/fields/base/definition.js'

describe('plugin embedded-field transformations', () => {
	it('rejects root-only metadata introduced inside a patched object field', () => {
		const Target = Schema.define({
			className: 'PatchedEmbeddedMetadataTarget',
			fields: () => ({}),
		})
		const invalidObject = replaceDeclaredFieldOptions(
			objectField({ fields: {} }),
			immutableRecord({
				fields: immutableRecord({
					email: stringField({ indexed: true }),
				}),
			}),
		)
		const plugin = definePlugin({
			core: '^0.0.0',
			declare: ({ schemas }) => {
				schemas.patch({
					operations: [
						addSchemaField({
							contributionId: 'profile',
							field: invalidObject,
							name: 'profile',
						}),
					],
					targets: schemas.select({
						className: 'PatchedEmbeddedMetadataTarget',
					}),
				})
			},
			pluginId: 'fixture.invalid-embedded-field-patch',
			privileges: [
				{
					name: 'schema:declare',
					reason: 'Exercises final embedded-field validation.',
				},
			] as const,
			version: '1.0.0',
		})
		const application = new FrameworkApplication({
			pluginPrivileges: { logger: false },
			plugins: [plugin],
			schemas: [Target],
		})

		let thrown: unknown
		try {
			application.compileSchemas()
		} catch (error: unknown) {
			thrown = error
		}

		expect(thrown).toBeInstanceOf(FrameworkError)
		if (!(thrown instanceof FrameworkError)) {
			throw new TypeError('Expected plugin declaration failure')
		}
		expect(thrown.code).toBe('PLUGIN_DECLARATION_INVALID')
		expect(thrown.cause).toBeInstanceOf(TypeError)
		if (!(thrown.cause instanceof TypeError)) {
			throw new TypeError('Expected embedded field validation cause')
		}
		expect(thrown.cause.message).toBe(
			'PatchedEmbeddedMetadataTarget.fields.profile.fields.email cannot use indexed inside objectField',
		)
	})
})

import { describe, expect, it } from 'vitest'
import { immutableRecord } from '@ultimabase/shared'
import { FrameworkApplication } from '../application/framework-application.js'

import {
	FrameworkError,
	addSchemaField,
	plugin as createPlugin,
	contributeDeclarations,
	objectField,
	stringField,
} from '../index.js'
import { replaceDeclaredFieldOptions } from '../schema/fields/base/definition.js'
import { UltimaBase } from '../runtime/application/ultima-base.js'

describe('plugin embedded-field transformations', () => {
	it('rejects root-only metadata introduced inside a patched object field', () => {
		const Target = UltimaBase.Schema.define({
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
		const plugin = createPlugin({
			core: '^0.0.0',
			id: 'fixture.invalid-embedded-field-patch',
			permissions: {
				'schema:declare': 'Exercises final embedded-field validation.',
			},
			version: '1.0.0',
			contributions: [
				contributeDeclarations({
					schema: ({ schemas }) => {
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

						return undefined
					},
				}),
			],
		})
		const application = new FrameworkApplication({
			logger: false,
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

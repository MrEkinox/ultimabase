import {
	FrameworkApplication,
	Schema,
	addSchemaField,
	definePlugin,
	defineSchemaOption,
	stringField,
	type SchemaOptions,
} from '@ultimabase/core'
import { describe, expect, it } from 'vitest'

import { generateApplicationTypes } from './generator.js'

describe('option-presence Typegen', () => {
	it('renders ordinary fields without exposing opaque direct-option values', () => {
		const documentOption = defineSchemaOption<(value: string) => string>({
			normalize: (value, path) => {
				if (typeof value !== 'function') {
					throw new TypeError(`${path} must be a function`)
				}
				return value as (value: string) => string
			},
			protocolVersion: 1,
			typegen: {
				module: '@fixture/typegen-document-plugin',
				type: 'DocumentOption',
			},
			valueKind: 'opaque',
		})
		const plugin = definePlugin({
			core: '^0.0.0',
			pluginId: 'fixture.typegen-document',
			privileges: [
				{
					name: 'schema:declare',
					reason: 'Adds a generated field for the direct option.',
				},
			] as const,
			version: '1.0.0',
			declare: ({ schemas }) => {
				schemas.defineOptions({
					contributionId: 'document-options',
					schema: { document: documentOption },
				})
				schemas.patch({
					operations: [
						addSchemaField({
							contributionId: 'document-state',
							field: stringField(),
							name: 'documentState',
						}),
					],
					targets: schemas.select({ option: { name: 'document' } }),
				})
			},
		})
		const Document = Schema.define({
			className: 'TypegenOptionPresenceDocument',
			document: (value: string) => value,
			fields: (field) => ({ title: field.string() }),
		} as SchemaOptions<'TypegenOptionPresenceDocument'> & {
			readonly document: (value: string) => string
		})
		const application = new FrameworkApplication({
			pluginPrivileges: { logger: false },
			plugins: [plugin],
			schemas: [Document],
		})
		const generated = generateApplicationTypes({
			application,
			applicationId: 'fixture.option-presence',
		})

		expect(generated.snapshot.schemas[0]?.fields).toContainEqual(
			expect.objectContaining({ name: 'documentState' }),
		)
		expect(generated.contents).toContain('documentState')
		expect(generated.contents).not.toContain('(value: string) => string')
	})
})

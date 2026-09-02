import { FrameworkApplication, Schema } from '@ultimabase/core'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import { describe, expect, it, vi } from 'vitest'

import { validationPlugin } from './plugin.js'
const passThrough = <TValue>(
	observe?: (value: TValue) => void,
): StandardSchemaV1<TValue, TValue> => ({
	'~standard': {
		validate: (value) => {
			const typedValue = value as TValue
			observe?.(typedValue)
			return { value: typedValue }
		},
		vendor: 'fixture',
		version: 1 as const,
	},
})

describe('validationPlugin', () => {
	it('keeps validation unavailable until the plugin is configured', async () => {
		const Document = Schema.define({
			className: 'MissingValidationPluginDocument',
			fields: (field) => ({
				title: field.string({ validation: passThrough<string>() }),
			}),
		})
		const application = new FrameworkApplication({
			plugins: [],
			schemas: [Document],
		})

		await expect(application.initialize()).rejects.toThrow(
			'Unknown string field option: validation',
		)
	})

	it('retains validator identity without invoking it during compilation', async () => {
		const validate = vi.fn((value: unknown) => ({ value: value as string }))
		const validator: StandardSchemaV1<string, string> = {
			'~standard': { validate, vendor: 'fixture', version: 1 },
		}
		const Document = Schema.define({
			className: 'InstalledValidationPluginDocument',
			fields: (field) => ({ title: field.string({ validation: validator }) }),
		})
		const application = new FrameworkApplication({
			pluginPrivileges: { logger: false },
			plugins: [validationPlugin()],
			schemas: [Document],
		})

		await application.initialize()
		expect(
			Reflect.get(Document.fields.title?.options ?? {}, 'validation'),
		).toBe(validator)
		expect(validate).not.toHaveBeenCalled()
		await application.dispose()
	})

	it('declares its exact identity and privileges', () => {
		const plugin = validationPlugin()
		expect(plugin.manifest).toMatchObject({
			identity: { pluginId: '@ultimabase/validation-plugin' },
			privileges: [{ name: 'schema:declare' }, { name: 'runtime:intercept' }],
		})
	})
})

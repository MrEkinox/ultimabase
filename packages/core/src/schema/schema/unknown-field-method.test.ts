import { describe, expect, it } from 'vitest'

import { createApplication } from '../../application/framework-application.js'
import { UltimaBase } from '../../runtime/application/ultima-base.js'
import type { FieldBuilder } from './field-builder.js'

/** Simulates a JavaScript caller, or stale types, using a method that does not exist. */
interface MistypedFieldBuilder {
	readonly number: () => never
	readonly vectorish: () => never
}

const mistyped = (field: FieldBuilder): MistypedFieldBuilder =>
	field as unknown as MistypedFieldBuilder

const failureOf = async (
	className: string,
	method: keyof MistypedFieldBuilder,
): Promise<unknown> => {
	const Schema = UltimaBase.Schema.define({
		className,
		fields: (field) => ({ value: mistyped(field)[method]() }),
	})
	return createApplication({ plugins: [], schemas: [Schema] }).catch(
		(error: unknown) => error,
	)
}

describe('unknown field builder methods', () => {
	// Regression: the top-level error only said "fields declaration could not be
	// resolved" and hid the method name in the cause chain.
	it('names the method in the schema error and suggests built-in methods', async () => {
		const failure = await failureOf('UnknownNumberField', 'number')

		expect(failure).toMatchObject({
			code: 'PLUGIN_DECLARATION_INVALID',
			cause: {
				code: 'SCHEMA_COMPILATION_FAILED',
				message:
					'Schema UnknownNumberField fields declaration could not be resolved: UnknownNumberField.fields.value FieldBuilder method "number" is unavailable; configure the plugin that declares it. Did you mean field.int() or field.float() or field.decimal()?',
			},
		})
	})

	it('keeps the plugin hint without suggestions for unrelated names', async () => {
		const failure = await failureOf('UnknownVectorishField', 'vectorish')

		expect(failure).toMatchObject({
			cause: {
				message:
					'Schema UnknownVectorishField fields declaration could not be resolved: UnknownVectorishField.fields.value FieldBuilder method "vectorish" is unavailable; configure the plugin that declares it',
			},
		})
	})
})

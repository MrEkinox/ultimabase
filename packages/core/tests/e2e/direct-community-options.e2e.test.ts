import { UltimaBase, type FieldBuilder } from '@ultimabase/core'
import { describe, expect, it } from 'vitest'

describe('direct community plugin options', () => {
	it('rejects schema and field options when their owner is absent', async () => {
		// JavaScript callers can still present an option with no installed owner.
		const UnknownSchemaOption = UltimaBase.Schema.define({
			className: 'OpenKernelUnknownDecimalSchemaOption',
			decimalLedger: { defaultScale: 2 },
			fields: (field: FieldBuilder) => ({ label: field.string() }),
		} as never)
		const schemaApplication = new UltimaBase({ schemas: [UnknownSchemaOption] })
		expect(() => schemaApplication.compile()).toThrow(
			'Unknown schema option: decimalLedger',
		)
		await schemaApplication.dispose()

		const UnknownFieldOption = UltimaBase.Schema.define({
			className: 'OpenKernelUnknownDecimalFieldOption',
			fields: (field) => ({
				label: field.string({
					// @ts-expect-error -- No generated community option contract is installed.
					decimalLabel: { format: 'plain' },
				}),
			}),
		})
		const fieldApplication = new UltimaBase({ schemas: [UnknownFieldOption] })
		expect(() => fieldApplication.compile()).toThrow(
			'Unknown string field option: decimalLabel',
		)
		await fieldApplication.dispose()
	})
})

import { UltimaBase, Schema, type SchemaOptions } from '@ultimabase/core'
import { describe, expect, it } from 'vitest'

import type { DecimalLedgerOption } from '../../../../tests/e2e/fixtures/open-kernel-value.js'

describe('direct community plugin options', () => {
	it('rejects schema and field options when their owner is absent', async () => {
		const UnknownSchemaOption = Schema.define({
			className: 'OpenKernelUnknownDecimalSchemaOption',
			decimalLedger: { defaultScale: 2 },
			fields: (field) => ({ label: field.string() }),
		} as SchemaOptions<'OpenKernelUnknownDecimalSchemaOption'> & {
			readonly decimalLedger: DecimalLedgerOption
		})
		const schemaApplication = new UltimaBase({
			plugins: [],
			schemas: [UnknownSchemaOption],
		})
		expect(() => schemaApplication.compile()).toThrow(
			'Unknown schema option: decimalLedger',
		)
		await schemaApplication.dispose()

		const UnknownFieldOption = Schema.define({
			className: 'OpenKernelUnknownDecimalFieldOption',
			fields: (field) => ({
				// @ts-expect-error -- No generated community option contract is installed.
				label: field.string({
					decimalLabel: { format: 'plain' },
				}),
			}),
		})
		const fieldApplication = new UltimaBase({
			plugins: [],
			schemas: [UnknownFieldOption],
		})
		expect(() => fieldApplication.compile()).toThrow(
			'Unknown string field option: decimalLabel',
		)
		await fieldApplication.dispose()
	})
})

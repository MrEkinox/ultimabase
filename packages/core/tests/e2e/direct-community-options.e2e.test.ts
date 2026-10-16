import { UltimaBase } from '@ultimabase/core'
import {
	plugin,
	provideSchemaRules,
	type PluginInstance,
	type PluginSchemaRulesSource,
	type SchemaRulesHKT,
} from '@ultimabase/core/plugin'
import { describe, expect, it } from 'vitest'

interface LedgerRules extends SchemaRulesHKT {
	readonly rules: Readonly<{
		decimalLedger?: Readonly<{ defaultScale: number }>
	}>
}

type LedgerPlugin = PluginInstance<{
	readonly core: '^0.0.0'
	readonly id: 'fixture.direct-ledger'
	readonly source: PluginSchemaRulesSource<LedgerRules>
	readonly version: '1.0.0'
}>

describe('direct community plugin options', () => {
	it('rejects schema and field options when their owner is absent', async () => {
		// A schema declared where its owner is installed, then registered in
		// an application without it (ADR-0339: `.with` names installed rules).
		const owner: LedgerPlugin = provideSchemaRules(
			plugin({
				core: '^0.0.0',
				id: 'fixture.direct-ledger',
				version: '1.0.0',
				contributions: [],
			}),
			['decimalLedger'],
		)
		const UnknownSchemaOption = UltimaBase.use(owner)
			.Schema.define({
				className: 'OpenKernelUnknownDecimalSchemaOption',
				fields: (field) => ({ label: field.string() }),
			})
			.with({ decimalLedger: { defaultScale: 2 } })
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

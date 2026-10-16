import {
	definePluginFieldFamily,
	definePluginField,
	type FieldOptions,
	type JsonObject,
	type PluginFieldDefinition,
} from '@ultimabase/core'
import {
	contributeDeclarations,
	defineFieldOption,
	defineSchemaOption,
	plugin,
	provideSchemaFeatures,
	type PluginDeclarationContribution,
	type PluginDeclarationSource,
	type PluginInstance,
	type PluginSchemaFieldsSource,
	type PluginSchemaFeatureSource,
	type SchemaFieldsHKT,
	type SchemaFeature,
} from '@ultimabase/core/plugin'
import { patchSchemas, schemaPatch } from '@ultimabase/plugin-kit'
import { immutableRecord, isPlainRecord } from '@ultimabase/shared'

/** Exact logical decimal representation used by Runtime and adapters. */
export interface DecimalValue {
	readonly scale: number
	readonly units: string
}

/** Configures the structural decimal contribution on one community schema. */
export interface DecimalLedgerOption extends JsonObject {
	readonly defaultScale: number
}

/** Configures how the community plugin interprets one existing label field. */
export interface DecimalLabelOption extends JsonObject {
	readonly format: 'accounting' | 'plain'
}

const decimalLedgerOption = defineSchemaOption<DecimalLedgerOption>({
	normalize: (value, path) => {
		if (
			!isPlainRecord(value) ||
			!Number.isSafeInteger(value.defaultScale) ||
			(value.defaultScale as number) < 0 ||
			(value.defaultScale as number) > 18
		) {
			throw new TypeError(
				`${path}.defaultScale must be an integer from 0 to 18`,
			)
		}

		return immutableRecord({ defaultScale: value.defaultScale as number })
	},
	protocolVersion: 1,
})

const decimalLabelOption = defineFieldOption<DecimalLabelOption>({
	contexts: ['stored'],
	normalize: (value, path) => {
		if (
			!isPlainRecord(value) ||
			(value.format !== 'accounting' && value.format !== 'plain')
		) {
			throw new TypeError(`${path}.format must be accounting or plain`)
		}

		return immutableRecord({ format: value.format })
	},
	protocolVersion: 1,
})

export const decimalFieldKind = 'fixture.open-kernel.decimal' as const
export type DecimalField = PluginFieldDefinition<
	typeof decimalFieldKind,
	DecimalValue,
	FieldOptions<DecimalValue>
>

const snapshotDecimal = (value: unknown, path: string): DecimalValue => {
	if (
		!isPlainRecord(value) ||
		typeof value.units !== 'string' ||
		!Number.isSafeInteger(value.scale) ||
		(value.scale as number) < 0 ||
		(value.scale as number) > 18
	) {
		throw new TypeError(
			`${path} must contain decimal string units and a scale from 0 to 18`,
		)
	}
	if (!/^-?(?:0|[1-9][0-9]*)$/u.test(value.units)) {
		throw new TypeError(`${path}.units must be a canonical integer string`)
	}
	return immutableRecord({ scale: value.scale as number, units: value.units })
}

export const decimalField = (): DecimalField =>
	definePluginField(
		decimalFieldKind,
		{ indexed: true, required: true },
		{
			snapshotValue: snapshotDecimal,
			storageCodec: {
				decode: (value) => snapshotDecimal(value, 'stored decimal'),
				encode: (value) => immutableRecord(value),
				format: 'json',
				version: 1,
			},
		},
	)

/** FieldBuilder contract of the logical decimal field. */
export type DecimalFieldBuilderMethod = () => DecimalField

const decimalBuilderMethod = definePluginFieldFamily({
	fieldKind: decimalFieldKind,
	builder: {
		name: 'preciseDecimal',
		contexts: {
			stored: {
				factory: decimalField,
			},
		},
	},
})

export interface ValuePluginOptions {
	readonly instanceId: string
	readonly targetClassName: string
}

// Form D (ADR-0297): `decimalLedger: { defaultScale }` is a define feature; the
// fields slot adds the `amount` field the patch below stores (ADR-0316).
interface DecimalLedgerFields extends SchemaFieldsHKT {
	readonly fields: 'decimalLedger' extends keyof this['shape']
		? Readonly<{ amount: DecimalField }>
		: unknown
}

const createDeclarations = (options: ValuePluginOptions) =>
	contributeDeclarations({
		schema: ({ fields, schemas }) => {
			const field = fields.register(decimalBuilderMethod)
			const optionsReceipt = schemas.defineOptions({
				contributionId: 'decimal-options',
				field: { decimalLabel: decimalLabelOption },
				schema: { decimalLedger: decimalLedgerOption },
			})
			schemas.patch(
				patchSchemas({
					patch: schemaPatch().addField({
						contributionId: 'decimal-amount',
						field: decimalField(),
						name: 'amount',
					}),
					targets: schemas.select({
						className: options.targetClassName,
						option: { name: 'decimalLedger' },
					}),
				}),
			)
			return [field, optionsReceipt]
		},
	})

type ValueSource =
	| PluginDeclarationSource<ReturnType<typeof createDeclarations>>
	| PluginSchemaFeatureSource<{
			decimalLedger: SchemaFeature<
				readonly [options: DecimalLedgerOption],
				Readonly<{ decimalLedger: DecimalLedgerOption }>
			>
	  }>
	| PluginSchemaFieldsSource<DecimalLedgerFields>

/** The community value plugin, with its form D source. */
export type ValuePlugin = PluginInstance<{
	readonly id: 'fixture.open-kernel-value'
	readonly instanceId: string
	readonly version: '1.0.0'
	readonly core: '^0.0.0'
	readonly source: ValueSource
}>

/** Adds one portable logical value and its source-typed schema surface. */
export const createValuePlugin = (options: ValuePluginOptions): ValuePlugin => {
	const declarations: PluginDeclarationContribution<readonly [], ValueSource> =
		createDeclarations(options)
	return provideSchemaFeatures<ValuePlugin>(
		plugin({
			core: '^0.0.0',
			id: 'fixture.open-kernel-value',
			version: '1.0.0',
			contributions: [declarations],
			instanceId: options.instanceId,
			permissions: {
				'schema:declare': 'Adds the decimal field and builder.',
			},
		}),
		{
			decimalLedger: {
				sets: ['decimalLedger'],
				apply: (ledger: DecimalLedgerOption) => ({ decimalLedger: ledger }),
			},
		},
	)
}

import {
	adapterValueStorageCapability,
	defineFieldBuilderMethod,
	defineFieldOption,
	definePluginField,
	defineSchemaOption,
	requireCapability,
	type FieldOptions,
	type JsonObject,
	type PluginDefinition,
	type PluginFieldDefinition,
	type SchemaDefinition,
} from '@ultimabase/core'
import {
	definePluginModule,
	defineTypegenModule,
	patchSchemas,
	schemaPatch,
} from '@ultimabase/plugin-kit'
import { immutableRecord, isPlainRecord } from '@ultimabase/shared'

/** Exact logical decimal representation used by Runtime, Typegen, and adapters. */
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
	typegen: {
		module: '@fixture/open-kernel',
		type: 'DecimalLedgerOption',
	},
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
	typegen: {
		module: '@fixture/open-kernel',
		type: 'DecimalLabelOption',
	},
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

/** Generated FieldBuilder contract for the logical decimal field. */
export type DecimalFieldBuilderMethod = () => DecimalField

const valueTypes = defineTypegenModule('@fixture/open-kernel')
const decimalBuilderMethod = defineFieldBuilderMethod({
	name: 'preciseDecimal',
	contexts: {
		stored: {
			factory: decimalField,
			fieldKind: decimalFieldKind,
			typegen: {
				methodType: 'DecimalFieldBuilderMethod',
				module: valueTypes.module,
				valueType: 'DecimalValue',
			},
		},
	},
})
const storage = requireCapability(adapterValueStorageCapability, '^1.0.0')
const valueModule = definePluginModule({
	core: '^0.0.0',
	pluginId: 'fixture.open-kernel-value',
	version: '1.0.0',
})

export interface ValuePluginOptions {
	readonly instanceId: string
	readonly target: SchemaDefinition
}

/** Adds one portable logical value and its exact generated field type. */
export const createValuePlugin = (
	options: ValuePluginOptions,
): PluginDefinition =>
	valueModule.plugin({
		capabilities: { requires: [storage] },
		declare: ({ fields, schemas, typegenReferences }) => {
			fields.register(decimalBuilderMethod)
			schemas.defineOptions({
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
						className: options.target.className,
						option: { name: 'decimalLedger' },
					}),
				}),
			)
			// The compiled graph retains its reference even without startup generation.
			typegenReferences.register(valueTypes.reference('DecimalValue'))
		},
		instanceId: options.instanceId,
		privileges: [
			{
				name: 'adapter:consume',
				reason: 'Requires portable JSON value storage.',
			},
			{ name: 'schema:declare', reason: 'Adds the decimal field and builder.' },
			{
				name: 'typegen:reference',
				reason: 'References the exact public decimal value.',
			},
		] as const,
	})

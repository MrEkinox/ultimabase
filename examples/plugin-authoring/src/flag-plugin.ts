//#region flag-plugin
import {
	booleanField,
	type ForbiddenMutationInputField,
} from '@ultimabase/core'
import {
	contributeDeclarations,
	defineSchemaOption,
	plugin,
	provideSchemaFeatures,
	provideSchemaRules,
	type PluginInstance,
	type PluginSchemaFeatureSource,
	type PluginSchemaFieldsSource,
	type PluginSchemaRulesSource,
	type SchemaFeature,
	type SchemaFieldsHKT,
	type SchemaRulesHKT,
} from '@ultimabase/core/plugin'
import { patchSchemas, schemaPatch } from '@ultimabase/plugin-kit'

const flaggedField = booleanField({ default: false, required: true })

/** Set by `flaggable: true`: selects the schemas that receive `flagged`. */
const flaggableOption = defineSchemaOption({
	normalize: (value, path): object => {
		if (typeof value !== 'object' || value === null)
			throw new TypeError(`${path} must be an object`)
		return {}
	},
	protocolVersion: 1,
})

/** The `flagReason` rule of `.with({ … })`. */
const flagReasonOption = defineSchemaOption({
	normalize: (value, path) => {
		if (typeof value !== 'string') throw new TypeError(`${path} must be text`)
		return value
	},
	protocolVersion: 1,
})

type FlagFeatures = PluginSchemaFeatureSource<{
	/** Adds a server-written `flagged` field. */
	readonly flaggable: SchemaFeature<
		readonly [],
		Readonly<{ flaggable: object }>
	>
}>

/** Reads only the features `define` sets, never the schema, so it adds no cycle. */
interface FlagFields extends SchemaFieldsHKT {
	readonly fields: 'flaggable' extends keyof this['shape']
		? Readonly<{ flagged: ForbiddenMutationInputField<typeof flaggedField> }>
		: unknown
}

/** Offers `flagReason` once `define` sets `flaggable: true`. */
interface FlagRules extends SchemaRulesHKT {
	readonly rules: 'flaggable' extends keyof this['shape']
		? Readonly<{ flagReason?: string }>
		: Readonly<Record<never, never>>
}

export type FlagPlugin = PluginInstance<{
	readonly id: 'community.flag'
	readonly version: '1.0.0'
	readonly core: '^0.0.0'
	readonly source:
		| FlagFeatures
		| PluginSchemaFieldsSource<FlagFields>
		| PluginSchemaRulesSource<FlagRules>
}>

export const flagPlugin = (): FlagPlugin => {
	const instance: FlagPlugin = plugin({
		id: 'community.flag',
		version: '1.0.0',
		core: '^0.0.0',
		contributions: [
			contributeDeclarations({
				schema: ({ schemas }) => {
					schemas.defineOptions({
						contributionId: 'flag-options',
						schema: {
							flaggable: flaggableOption,
							flagReason: flagReasonOption,
						},
					})
					schemas.patch(
						patchSchemas({
							targets: schemas.select({ option: { name: 'flaggable' } }),
							patch: schemaPatch()
								.addField({
									contributionId: 'flagged-field',
									name: 'flagged',
									field: flaggedField,
									mutationInput: 'forbidden',
								})
								.addIndex({
									contributionId: 'flagged-index',
									fields: ['flagged', 'createdAt'],
								}),
						}),
					)
					return undefined
				},
			}),
		],
	})
	// The rule names become the keys `.with` accepts, here `flagReason`.
	return provideSchemaRules<FlagPlugin>(
		provideSchemaFeatures<FlagPlugin, FlagFeatures>(instance, {
			flaggable: { sets: ['flaggable'], apply: () => ({ flaggable: {} }) },
		}),
		['flagReason'],
	)
}
//#endregion flag-plugin

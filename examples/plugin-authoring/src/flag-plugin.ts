//#region flag-plugin
import {
	booleanField,
	type ForbiddenMutationInputField,
} from '@ultimabase/core'
import {
	contributeDeclarations,
	defineSchemaOption,
	plugin,
	provideSchemaShapeMethods,
	type PluginInstance,
	type PluginSchemaFieldsSource,
	type PluginSchemaRulesSource,
	type PluginSchemaShapeSource,
	type SchemaFieldsHKT,
	type SchemaRulesHKT,
	type SchemaShapeMethod,
} from '@ultimabase/core/plugin'
import { patchSchemas, schemaPatch } from '@ultimabase/plugin-kit'

const flaggedField = booleanField({ default: false, required: true })

/** Set by `.flaggable()`: selects the schemas that receive `flagged`. */
const flaggableOption = defineSchemaOption({
	normalize: (value, path): object => {
		if (typeof value !== 'object' || value === null)
			throw new TypeError(`${path} must be an object`)
		return {}
	},
	protocolVersion: 1,
})

/** The `flagReason` entry of `.with({ ... })`. */
const flagReasonOption = defineSchemaOption({
	normalize: (value, path) => {
		if (typeof value !== 'string') throw new TypeError(`${path} must be text`)
		return value
	},
	protocolVersion: 1,
})

type FlagShape = PluginSchemaShapeSource<{
	/** Adds a server-written `flagged` field. */
	readonly flaggable: SchemaShapeMethod<
		readonly [],
		Readonly<{ flaggable: object }>
	>
}>

/** Reads only the called shape methods, never the schema, so it adds no cycle. */
interface FlagFields extends SchemaFieldsHKT {
	readonly fields: 'flaggable' extends keyof this['shape']
		? Readonly<{ flagged: ForbiddenMutationInputField<typeof flaggedField> }>
		: unknown
}

/** Offers `flagReason` once `.flaggable()` is called. */
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
		| FlagShape
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
					//#region flag-patch
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
					//#endregion flag-patch
					return undefined
				},
			}),
		],
	})
	return provideSchemaShapeMethods<FlagPlugin, FlagShape>(instance, {
		flaggable: { sets: ['flaggable'], apply: () => ({ flaggable: {} }) },
	})
}
//#endregion flag-plugin

//#region rating-plugin
import { definePluginFieldFamily } from '@ultimabase/core'
import { contributeDeclarations, plugin } from '@ultimabase/core/plugin'
import {
	defineOutputDescriptor,
	definePluginFieldOption,
} from '@ultimabase/plugin-kit'

/** `output.rating()`: a virtual field's numeric result, in the output context only. */
const ratingFamily = definePluginFieldFamily({
	fieldKind: 'community.rating',
	builder: {
		name: 'rating',
		contexts: {
			output: {
				factory: () =>
					defineOutputDescriptor(
						'community.rating',
						{ list: false, required: true },
						(value, path) => {
							if (typeof value !== 'number') {
								throw new TypeError(`${path} must be a number`)
							}
							return value
						},
					),
			},
		},
	},
})

/** `searchable: true` on a stored field, normalized to a boolean. */
const searchableOption = definePluginFieldOption({
	contexts: ['stored'],
	normalize: (value) => value === true,
	protocolVersion: 1,
})

export const ratingPlugin = () =>
	plugin({
		id: 'community.rating',
		core: '^0.0.0',
		version: '1.0.0',
		contributions: [
			contributeDeclarations({
				// Returning the receipts types the builder method and the option.
				schema: ({ fields, schemas }) => [
					fields.register(ratingFamily),
					schemas.defineOptions({
						contributionId: 'rating-options',
						field: { searchable: searchableOption },
					}),
				],
			}),
		],
	})
//#endregion rating-plugin

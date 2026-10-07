import {
	contributeDeclarations,
	definePluginField,
	definePluginFieldFamily,
	plugin,
	type FieldOptions,
} from '@ultimabase/core'

const profileSlugField = (options: FieldOptions<string>) =>
	definePluginField('fixture.profile-slug', options, {
		snapshotValue: (value: unknown, path: string): string => {
			if (typeof value !== 'string') {
				throw new TypeError(`${path} must be a string`)
			}
			return value
		},
	})

const profileSlugFamily = definePluginFieldFamily({
	fieldKind: 'fixture.profile-slug',
	typegen: {
		module: '@ultimabase/hooks-plugin',
		valueType: 'ProfileSlugFixtureValue',
	},
	builder: {
		name: 'profileSlug',
		contexts: {
			embedded: {
				factory: profileSlugField,
				methodType: 'ProfileSlugFixtureFieldBuilderMethod',
			},
		},
	},
})

/** Installs the embedded plugin-field family exercised by Hooks source typing. */
export const profileSlugPlugin = plugin({
	core: '^0.0.0',
	id: 'fixture.hooks-plugin-profile-slug',
	permissions: {
		'schema:declare': 'Declares the profile slug fixture field.',
	},
	version: '0.0.0',
	contributions: [
		contributeDeclarations({
			schema: ({ fields }) => fields.register(profileSlugFamily),
		}),
	],
})

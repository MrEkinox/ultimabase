//#region post-rules-plugin
import { PublicError } from '@ultimabase/core'
import { plugin } from '@ultimabase/core/plugin'
import {
	provideHookContributions,
	schemaHooks,
	type SchemaHookContributionDefinition,
} from '@ultimabase/hooks-plugin'

import { Post } from './schema.ts'

/** A compatible plugin contributing one Post rule to the Hooks engine. */
export const postRulesPlugin = plugin({
	id: 'example.post-rules',
	version: '1.0.0',
	core: '^0.0.0',
	peers: [{ pluginId: '@ultimabase/hooks-plugin', version: '^0.0.0' }],
	permissions: {
		'runtime:intercept': 'Keeps published posts from being deleted.',
	},
	contributions: [
		provideHookContributions(
			'published-post-rule',
			// The return type keeps this plugin's type out of the Register cycle.
			(): SchemaHookContributionDefinition =>
				schemaHooks(Post, {
					beforeOperation: {
						delete: ({ originalItem }) => {
							if (originalItem.published) {
								throw new PublicError('Unpublish the post first.', {
									code: 'post.published-delete',
								})
							}
						},
					},
				}),
		),
	],
})
//#endregion post-rules-plugin

import {
	fieldAccess,
	provideAccessContributions,
	schemaAccess,
} from '@ultimabase/access-plugin'
import { plugin } from '@ultimabase/core/plugin'
import {
	fieldHooks,
	provideHookContributions,
	schemaHooks,
} from '@ultimabase/hooks-plugin'

import { Post } from './schema.ts'

// A plugin targeting a registered schema, installed in the registered
// application, with unannotated contribution factories: typing it must not
// read `Register` (TS7022 on the plugin and the application otherwise).
export const rulesPlugin = plugin({
	id: 'register-cycle.rules',
	version: '1.0.0',
	core: '^0.0.0',
	peers: [
		{ pluginId: '@ultimabase/access-plugin', version: '^0.0.0' },
		{ pluginId: '@ultimabase/hooks-plugin', version: '^0.0.0' },
	],
	permissions: { 'runtime:constrain': 'Rules.', 'runtime:intercept': 'Rules.' },
	contributions: [
		provideHookContributions('post-hooks', () =>
			schemaHooks(Post, {
				beforeOperation: {
					delete: ({ originalItem }) => {
						const published: boolean = originalItem.published
						const slug: string = originalItem.slug
						// @ts-expect-error unknown field of the targeted schema
						void originalItem.nope
						void [published, slug, originalItem.author]
					},
					softDeleteOne: ({ originalItem }) => void originalItem.published,
					// @ts-expect-error unknown plugin command of the targeted schema
					nope: () => undefined,
				},
			}),
		),
		provideHookContributions('post-field-hooks', () => {
			// A field contribution receives the runtime field of `Post.fields`,
			// whose values are `unknown`.
			const title = Post.fields.title
			if (title?.kind !== 'string') throw new TypeError('Expected Post.title')
			return [
				fieldHooks(Post, title, ['title'], {
					resolveInput: ({ value }) =>
						typeof value === 'string' ? value.trim() : value,
				}),
				fieldHooks(Post, title, ['title'], {
					// @ts-expect-error unknown field Hook
					nope: () => undefined,
				}),
			]
		}),
		provideAccessContributions('post-access', () =>
			schemaAccess(Post, {
				delete: {
					where: ({ where }) => where.eq('published', false),
					item: ({ originalItem }) => !originalItem.published,
				},
				softDeleteOne: true,
				// @ts-expect-error unknown permission of the targeted schema
				nope: true,
			}),
		),
		provideAccessContributions('post-field-access', () => {
			const title = Post.fields.title
			const author = Post.fields.author
			if (title?.kind !== 'string' || author?.kind !== 'pointer') {
				throw new TypeError('Expected Post.title and Post.author')
			}
			return [
				fieldAccess(Post, title, ['title'], {
					read: true,
					write: {
						replace: ({ originalValue, value }) => originalValue !== value,
					},
				}),
				fieldAccess(Post, author, ['author'], {
					read: { where: false },
					write: { clear: false },
					// @ts-expect-error unknown field rule
					nope: true,
				}),
			]
		}),
	],
})

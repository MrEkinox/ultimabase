//#region review-plugin
import { dateTimeField } from '@ultimabase/core'
import { command, definePlugin, feature } from '@ultimabase/plugin-kit'

/**
 * `reviewable: true` in `define` adds `reviewedAt` and `approveOne`; it
 * requires `plugins.review('editors')` in `.with`, which names the reviewers.
 */
export const reviewPlugin = () =>
	definePlugin({
		name: '@example/review-plugin',
		// Features: what a schema is. Static values, keys of `define`.
		features: {
			reviewable: feature({
				fields: { reviewedAt: dateTimeField() },
				commands: {
					approveOne: command({
						authority: 'request',
						effect: 'update',
						data: () => ({ reviewedAt: new Date().toISOString() }),
					}),
				},
				requires: ['review'],
			}),
		},
		// Rules: how the plugin treats a schema. Methods of `plugins` in `.with`.
		rules: {
			review: (value, path) => {
				if (typeof value !== 'string' || value === '')
					throw new TypeError(`${path} must name the reviewers`)
				return value
			},
		},
		afterCommit: ({ className, operation, rules }) => {
			if (operation === 'create-one' && typeof rules.review === 'string')
				console.info(`[review] ${className} waits for ${rules.review}`)
		},
	})
//#endregion review-plugin

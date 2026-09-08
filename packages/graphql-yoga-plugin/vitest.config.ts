import { mergeConfig } from 'vitest/config'

import packageConfig from '../../tooling/vitest/package.config.js'

// Yoga and the schema must share one transformed GraphQL module in Vitest.
export default mergeConfig(packageConfig, {
	test: {
		server: {
			deps: {
				inline: [
					'graphql',
					'graphql-yoga',
					/^@envelop\//u,
					/^@graphql-tools\//u,
					/^@graphql-yoga\//u,
				],
			},
		},
	},
})

import { graphqlYogaPlugin } from '@ultimabase/graphql-yoga-plugin'

export const yoga = graphqlYogaPlugin({
	bodyLimit: 512 * 1024,
	introspection: true,
	path: '/api/graphql',
})

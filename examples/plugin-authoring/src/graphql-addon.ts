//#region graphql-addon
import { plugin } from '@ultimabase/core/plugin'
import { provideGraphqlSchemas } from '@ultimabase/graphql-plugin'
import { GraphQLObjectType, GraphQLSchema, GraphQLString } from 'graphql'

const health = new GraphQLSchema({
	query: new GraphQLObjectType({
		fields: {
			workflowHealth: {
				resolve: () => 'ok',
				type: GraphQLString,
			},
		},
		name: 'Query',
	}),
})

export const workflowGraphqlAddon = () =>
	plugin({
		contributions: [
			provideGraphqlSchemas({
				contributionId: 'workflow-health',
				create: () => health,
			}),
		],
		core: '^0.0.0',
		// Checked against the installed GraphQL plugin, without ordering.
		peers: [{ pluginId: '@ultimabase/graphql-plugin', version: '^0.0.0' }],
		id: 'community.workflow-graphql',
		version: '1.0.0',
	})
//#endregion graphql-addon

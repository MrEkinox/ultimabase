//#region custom-schema
import { GraphQLObjectType, GraphQLSchema, GraphQLString } from 'graphql'

/**
 * A completed schema from the reference `graphql` package (Pothos, Nexus or
 * GraphQL Tools work too). GraphQL composes its root fields after the
 * generated ones; a duplicate name fails startup.
 */
export const versionSchema = new GraphQLSchema({
	query: new GraphQLObjectType({
		name: 'Query',
		fields: {
			version: { type: GraphQLString, resolve: () => '1.0.0' },
		},
	}),
})
//#endregion custom-schema

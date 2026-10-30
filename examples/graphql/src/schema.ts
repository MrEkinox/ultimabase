// The fields `extend` adds to the generated schema: each runs with the
// request's caller, and reads what the client selects.
//#region extend
import type { GraphQLFieldConfigMap } from 'graphql'
import {
	assertObjectType,
	GraphQLList,
	GraphQLNonNull,
	GraphQLObjectType,
	GraphQLSchema,
	GraphQLString,
} from 'graphql'
import type { GraphqlContext } from '@ultimabase/graphql'
import { Post } from './models.ts'

export function extend(schema: GraphQLSchema): GraphQLSchema {
	const post = assertObjectType(schema.getType('Post'))
	const fields: GraphQLFieldConfigMap<unknown, GraphqlContext> = {
		me: {
			type: new GraphQLNonNull(GraphQLString),
			resolve: (_, __, context) => context.caller.kind,
		},
		drafts: {
			type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(post))),
			// `context.select(info)` reads the fields the client asked for,
			// relations included, in the same query.
			resolve: (_, __, context, info) =>
				Post.findMany(
					{ where: { status: 'draft' }, select: context.select(info) },
					{ as: context.caller },
				),
		},
	}
	const config = schema.toConfig()
	return new GraphQLSchema({
		...config,
		query: new GraphQLObjectType({
			name: 'Query',
			fields: { ...schema.getQueryType()?.toConfig().fields, ...fields },
		}),
		types: config.types.filter((type) => type.name !== 'Query'),
	})
}
//#endregion

// An application that emits declarations without isolatedDeclarations
// (D-70): what it exports names the plugin's types, which must be exported.
import { graphql, graphqlPlugin } from '@ultimabase/graphql'
import { httpPlugin } from '@ultimabase/http'
import { defineApp, defineModel, memory } from 'ultimabase'

export const Note = defineModel({
	name: 'Note',
	use: [graphql()],
	fields: (f) => ({ title: f.string() }),
}).with({ graphql: { plural: 'notes' } })

export const app = defineApp({
	database: memory(),
	plugins: [httpPlugin(), graphqlPlugin({ maxDepth: 5 })],
	models: [Note],
})

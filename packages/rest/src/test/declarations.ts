// An application that emits declarations without isolatedDeclarations
// (D-70): what it exports names the plugin's types, which must be exported.
import { httpPlugin } from '@ultimabase/http'
import { rest, restPlugin } from '@ultimabase/rest'
import { defineApp, defineModel, memory } from 'ultimabase'

export const Note = defineModel({
	name: 'Note',
	use: [rest()],
	fields: (f) => ({ title: f.string() }),
}).with({ rest: { plural: 'notes' } })

export const app = defineApp({
	database: memory(),
	plugins: [httpPlugin(), restPlugin({ maxDepth: 5 })],
	models: [Note],
})

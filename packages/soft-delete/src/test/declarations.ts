// An application that emits declarations without isolatedDeclarations
// (D-70): what it exports names the plugin's types, which must be exported.
import { softDelete, softDeletePlugin } from '@ultimabase/soft-delete'
import { defineApp, defineModel, memory } from 'ultimabase'

export const Note = defineModel({
	name: 'Note',
	use: [softDelete()],
	fields: (f) => ({ title: f.string() }),
})

export const app = defineApp({
	database: memory(),
	plugins: [softDeletePlugin()],
	models: [Note],
})

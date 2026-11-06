// The model the application serves, which Master writes during a maintenance.
import { defineModel } from 'ultimabase'

export const Post = defineModel({
	name: 'Post',
	fields: (f) => ({ title: f.string() }),
}).with({ access: { read: () => true } })

import { many, string } from '../index.ts'
import { App } from './app.ts'
import { Post } from './post.ts'

export const Tag = App.defineModel({
	name: 'Tag',
	fields: { label: string({ unique: true }), posts: many(() => Post) },
})

import { defineModel } from '../index.ts'
import { Post } from './post.ts'

export const Tag = defineModel({
	name: 'Tag',
	fields: (f) => ({
		label: f.string({ unique: true }),
		posts: f.many(() => Post),
	}),
})

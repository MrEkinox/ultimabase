import { defineModel, many, string } from '../index.ts'
import { Post } from './post.ts'

export const Tag = defineModel({
	name: 'Tag',
	fields: { label: string({ unique: true }), posts: many(() => Post) },
})

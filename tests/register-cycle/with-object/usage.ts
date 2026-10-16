import { Author } from './author.ts'
import { Post } from './post.ts'

export const posts = await Post.findMany({
	where: { published: { eq: true }, isDeleted: { eq: false } },
	include: { author: { select: { name: true } } },
})
export const authors = await Author.findMany({ where: { name: { eq: 'a' } } })
// complete non-partial unique index: typed target
export const updated = await Post.updateOne({
	where: { author: 'a', slug: 's' },
	data: { title: 't' },
})
export const deleted = await Post.softDeleteOne({ id: 'x' })
export const title: string | undefined = posts[0]?.title
export const acl = posts[0]?.acl

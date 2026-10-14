import { Author, Comment, Post } from '../src/schema.ts'

// Test data shared by the files; each test starts from empty tables.

let authors = 0

export const createAuthor = (
	data: { readonly verified?: boolean; readonly editor?: boolean } = {},
) => {
	authors += 1
	return Author.createOne({
		data: {
			displayName: `Author ${String(authors)}`,
			email: `author-${String(authors)}@example.com`,
			...data,
		},
	})
}

export const createPosts = (
	data: readonly {
		readonly title: string
		readonly published?: boolean
		readonly views?: number
		readonly tags?: readonly string[]
		readonly author?: string
	}[],
) =>
	Post.createMany({
		data: data.map(({ author, tags, title, ...rest }, index) => ({
			...rest,
			title,
			slug: `${title.toLowerCase().replaceAll(/\W+/gu, '-')}-${String(index)}`,
			...(tags === undefined ? {} : { tags: [...tags] }),
			...(author === undefined ? {} : { author: { connect: author } }),
		})),
	})

export const createComments = (bodies: readonly string[]) =>
	Comment.createMany({ data: bodies.map((body) => ({ body })) })

/** A valid UUID that no row uses. */
export const missingId = '00000000-0000-4000-8000-000000000000'

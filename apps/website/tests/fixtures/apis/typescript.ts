import { ApiPost } from './schema.js'

export const readPublishedPosts = () =>
	ApiPost.findMany({
		limit: 20,
		select: { id: true, title: true },
		where: { published: { eq: true } },
	})

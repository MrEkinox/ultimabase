import { Article } from './schemas.js'

export const readVisibleArticles = () =>
	Article.findMany({
		select: { title: true },
		where: { published: { eq: true } },
	})

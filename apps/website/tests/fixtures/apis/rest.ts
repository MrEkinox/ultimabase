export const readPostsOverRest = () =>
	fetch(
		'https://api.example/api/v1/classes/ApiPost?where=%7B%22published%22%3A%7B%22eq%22%3Atrue%7D%7D&select=id%2Ctitle',
		{
			headers: { 'X-UltimaBase-Application-Id': 'blog' },
		},
	)

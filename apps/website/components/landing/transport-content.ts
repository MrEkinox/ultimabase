/** Requests target the existing minimal example, whose title hook trims whitespace. */
export const transportExamples = [
	{
		label: 'TypeScript',
		lang: 'ts',
		caption: 'Inside the minimal example, with its started application.',
		code: `import { ExampleArticle } from './src/schema.ts'

const article = await ExampleArticle.createOne(
  {
    data: {
      slug: 'hello-typescript',
      title: '  Hello UltimaBase  ',
    },
  }
)`,
	},
	{
		label: 'REST',
		lang: 'http',
		caption: 'Send this JSON request to the local example on port 1337.',
		code: `POST /api/classes/ExampleArticle HTTP/1.1
Host: localhost:1337
Content-Type: application/json
X-UltimaBase-Application-Id: minimal

{
  "slug": "hello-rest",
  "title": "  Hello UltimaBase  "
}`,
	},
	{
		label: 'GraphQL',
		lang: 'graphql',
		caption:
			'POST /graphql on port 1337, with Content-Type: application/json and X-UltimaBase-Application-Id: minimal. Put this document in the JSON query field.',
		code: `mutation CreateArticle {
  createExampleArticle(input: {
    slug: "hello-graphql"
    title: "  Hello UltimaBase  "
  }) {
    id
    title
  }
}`,
	},
] as const

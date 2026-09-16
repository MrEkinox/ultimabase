import { createMDX } from 'fumadocs-mdx/next'

const withMDX = createMDX()

export default withMDX({
	experimental: {
		globalNotFound: true,
	},
	reactStrictMode: true,
	async rewrites() {
		return [
			{
				source: '/docs/:slug*.md',
				destination: '/llms.mdx/docs/:slug*/content.md',
			},
		]
	},
})

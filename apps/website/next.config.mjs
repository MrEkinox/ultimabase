import { createMDX } from 'fumadocs-mdx/next'

const withMDX = createMDX()

export default withMDX({
	experimental: {
		globalNotFound: true,
	},
	reactStrictMode: true,
})

import { defineConfig, defineDocs } from 'fumadocs-mdx/config'

const postprocess = { includeProcessedMarkdown: true }

/** The pages of `main`, served at `/docs/next`. */
export const docs = defineDocs({ dir: 'content/docs', docs: { postprocess } })

/** Each published version, frozen by `yarn website:freeze`. */
export const versions = defineDocs({
	dir: 'content/versions',
	docs: { postprocess },
})

export default defineConfig()

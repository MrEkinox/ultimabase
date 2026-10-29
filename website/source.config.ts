import { defineConfig, defineDocs } from 'fumadocs-mdx/config'
import convert from 'npm-to-yarn'

const postprocess = { includeProcessedMarkdown: true }

/** The pages of `main`, served at `/docs/next`. */
export const docs = defineDocs({ dir: 'content/docs', docs: { postprocess } })

/** Each published version, frozen by `yarn website:freeze`. */
export const versions = defineDocs({
	dir: 'content/versions',
	docs: { postprocess },
})

/** An `npm` code block, rewritten line by line for another manager. */
function inManager(manager: 'pnpm' | 'yarn'): (command: string) => string {
	return (command) =>
		command
			.split('\n')
			.map((line) => convert(line, manager))
			.join('\n')
}

// An `npm` code block shows a tab per manager the starter supports; the
// reader's choice is kept from page to page.
export default defineConfig({
	mdxOptions: {
		remarkNpmOptions: {
			persist: { id: 'package-manager' },
			packageManagers: [
				{ name: 'npm', command: (command) => command },
				{ name: 'pnpm', command: inManager('pnpm') },
				{ name: 'yarn', command: inManager('yarn') },
			],
		},
	},
})

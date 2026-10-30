// Every version's pages in one source (D-155): the pages of `main` under
// `next/`, each frozen version under its own folder. The latest version is
// served at `/docs`, the others at `/docs/<version>`.
import { docs, versions } from '../.source/server'
import { loader } from 'fumadocs-core/source'
import type { Node, Root } from 'fumadocs-core/page-tree'
import type { InferPageType } from 'fumadocs-core/source'

const next = docs.toFumadocsSource()
const frozen = versions.toFumadocsSource()

/** The published versions, newest first. */
export const published: readonly string[] = [
	...new Set(frozen.files.map((file) => file.path.split('/')[0] ?? '')),
]
	.filter((version) => version !== '')
	.toSorted((a, b) => b.localeCompare(a, 'en', { numeric: true }))

/** The version `/docs` shows: the latest published one, else `next`. */
export const latest: string = published[0] ?? 'next'

const files: typeof next.files = [
	...next.files.map((file) => ({ ...file, path: `next/${file.path}` })),
	...frozen.files,
]

export const source = loader({
	baseUrl: '/docs',
	source: { files },
	url: (slugs) => {
		const [version, ...rest] = slugs
		const path = version === latest && latest !== 'next' ? rest : slugs
		return ['/docs', ...path].join('/')
	},
})

/** A version's place in the menu: the newest first, then `next`. */
function rank(node: Node): number {
	const at = published.indexOf(node.$id ?? '')
	return at === -1 ? published.length : at
}

/** The sidebar, with its versions menu. */
export function pageTree(): Root {
	const tree = source.getPageTree()
	return {
		...tree,
		children: tree.children.toSorted((a, b) => rank(a) - rank(b)),
	}
}

export type Page = InferPageType<typeof source>

/** The page at a URL's segments after `/docs`. */
export function pageAt(segments: readonly string[]): Page | undefined {
	const [first] = segments
	const versioned = first === 'next' || published.includes(first ?? '')
	return source.getPage(versioned ? [...segments] : [latest, ...segments])
}

/** A page's URL segments after `/docs`. */
export const segmentsOf = (page: Page): string[] => page.url.split('/').slice(2)

/** The version a page belongs to. */
export const versionOf = (page: Page): string => page.slugs[0] ?? latest

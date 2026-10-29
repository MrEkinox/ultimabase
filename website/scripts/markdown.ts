// Moves each page's Markdown from `out/llms.mdx/docs/<page>/content.md` to
// `out/docs/<page>.md` (D-155): a static export cannot give a route the path
// of a page with `.md` appended.
import { readdirSync, renameSync, rmdirSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'

const from = join('out', 'llms.mdx')

function move(directory: string): void {
	for (const entry of readdirSync(directory, { withFileTypes: true })) {
		const path = join(directory, entry.name)
		if (entry.isDirectory()) move(path)
		else if (entry.name === 'content.md') {
			renameSync(path, join('out', `${relative(from, dirname(path))}.md`))
		}
	}
	// Only emptied folders: `rmdirSync` refuses any other.
	rmdirSync(directory)
}

move(from)

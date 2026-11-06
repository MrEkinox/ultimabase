// A region of an example, read when the site builds (D-155): the landing
// page shows only code an example's tests run, as a documentation page does,
// and each block links the file it comes from.
import { readFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import { ServerCodeBlock } from 'fumadocs-ui/components/codeblock.rsc'

import { region } from '../scripts/regions.ts'

const source = 'https://github.com/MrEkinox/ultimabase/blob/main/examples/'

/**
 * `file` is under `examples/`, `region` one of its `//#region` markers. Without
 * a region the whole file shows, as a request file does on a page (D-282).
 */
export function Example({
	file,
	region: name,
}: {
	readonly file: string
	readonly region?: string
}) {
	const content = readFileSync(
		join(process.cwd(), '..', 'examples', file),
		'utf8',
	)
	const code = name === undefined ? content.trimEnd() : region(content, name)
	if (code === undefined) {
		throw new Error(`examples/${file} has no region "${name}".`)
	}
	const title = (
		<a className="ub-source" href={`${source}${file}`}>
			<span>examples/</span>
			{file}
		</a>
	)
	return (
		<ServerCodeBlock
			code={code}
			codeblock={{ title }}
			lang={extname(file).slice(1)}
			themes={{ light: 'github-light', dark: 'github-dark' }}
		/>
	)
}

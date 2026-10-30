// A region of an example, read when the site builds (D-155): the landing
// page shows only code an example's tests run, as a documentation page does,
// and each block links the file it comes from.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ServerCodeBlock } from 'fumadocs-ui/components/codeblock.rsc'

import { region } from '../scripts/regions.ts'

const source = 'https://github.com/MrEkinox/ultimabase/blob/main/examples/'

/** `file` is under `examples/`, `region` one of its `//#region` markers. */
export function Example({
	file,
	region: name,
}: {
	readonly file: string
	readonly region: string
}) {
	const content = readFileSync(
		join(process.cwd(), '..', 'examples', file),
		'utf8',
	)
	const code = region(content, name)
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
			lang="ts"
			themes={{ light: 'github-light', dark: 'github-dark' }}
		/>
	)
}

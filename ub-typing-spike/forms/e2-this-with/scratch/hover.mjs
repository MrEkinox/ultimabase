import path from 'node:path'
import { createService } from '../../../tools/probe.mjs'
const dir = path.resolve(process.argv[2])
const ls = createService(dir)
for (const spec of process.argv.slice(3)) {
	const [file, find, offset] = spec.split('::')
	const f = path.join(dir, file)
	const i = ls.text(f).indexOf(find)
	console.log(`--- ${find}\n${ls.hover(f, i + Number(offset ?? 0))}`)
}

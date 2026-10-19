// Checks order dependence: for each file F, a fresh TS6 language service asks F's diagnostics first,
// then every file's. Usage: node forms/d-class/specs/order.mjs <project-dir>
import path from 'node:path'
import { createService } from '../../d-class-body/tools/probe.mjs'
const dir = path.resolve(process.argv[2])
const probe = createService(dir)
for (const first of probe.files.keys()) {
	const ls = createService(dir)
	const early = ls.service.getSemanticDiagnostics(first).length
	const all = ls.diagnostics()
	const codes = [...new Set(all.map((d) => `TS${d.code}`))].join(' ')
	console.log(`${path.relative(dir, first)} first: ${early} in it, ${all.length} total ${codes}`)
}

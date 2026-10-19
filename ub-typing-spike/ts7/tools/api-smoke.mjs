// Checks what the TS7 programmatic API (typescript/unstable/sync) offers to repository tooling:
// project diagnostics, type at a position (typeToString), checker completions. No quick info.
import fs from 'node:fs'
import path from 'node:path'
import { API } from 'typescript/unstable/sync'

const dir = path.resolve(process.argv[2])
const file = path.join(dir, process.argv[3])
const marker = process.argv[4]
const api = new API({ cwd: dir })
const snapshot = api.updateSnapshot({ openProjects: [path.join(dir, 'tsconfig.json')] })
const project = snapshot.getProject(path.join(dir, 'tsconfig.json')) ?? snapshot.getProjects()[0]
const diagnostics = project.program.getSemanticDiagnostics()
console.log('semantic diagnostics:', diagnostics.length)
const position = fs.readFileSync(file, 'utf8').indexOf(marker)
const type = project.checker.getTypeAtPosition(file, position)
console.log('typeToString at marker:', type ? project.checker.typeToString(type) : '(none)')
const symbol = project.checker.getSymbolAtPosition(file, position)
console.log('symbol:', symbol?.name)
console.log('quick info method on checker:', typeof project.checker.getQuickInfoAtPosition)
api.close()

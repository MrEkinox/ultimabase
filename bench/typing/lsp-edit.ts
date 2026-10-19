// Editor typing cost on TypeScript 7 through its native LSP server (D-12).
// One fresh server per run: open every project file, pull the diagnostics of
// the probed file ("first"), apply one edit, pull them again ("edit").
// Usage: node bench/typing/lsp-edit.ts <project-dir> <file> <from> <to>
// Prints one JSON line; times are milliseconds.
import { spawn } from 'node:child_process'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import { pathToFileURL } from 'node:url'

type Message = {
	id?: number | string
	method?: string
	result?: unknown
	error?: unknown
}
type Diagnostic = { severity?: number; message: string }

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null
const toMessage = (value: unknown): Message => {
	if (!isRecord(value)) throw new TypeError('LSP message is not an object')
	const { id, method, result, error } = value
	return {
		...(typeof id === 'number' || typeof id === 'string' ? { id } : {}),
		...(typeof method === 'string' ? { method } : {}),
		...('result' in value ? { result } : {}),
		...('error' in value ? { error } : {}),
	}
}
const toDiagnostics = (value: unknown): Diagnostic[] => {
	const items = isRecord(value) && Array.isArray(value.items) ? value.items : []
	return items.flatMap((item: unknown) =>
		isRecord(item) && typeof item.message === 'string'
			? [
					{
						message: item.message,
						...(typeof item.severity === 'number'
							? { severity: item.severity }
							: {}),
					},
				]
			: [],
	)
}

const compiler = join(
	dirname(createRequire(import.meta.url).resolve('typescript/package.json')),
	'bin',
	'tsc',
)

const [projectArgument, fileArgument, from, to] = process.argv.slice(2)
if (
	projectArgument === undefined ||
	fileArgument === undefined ||
	from === undefined ||
	to === undefined
) {
	throw new Error('usage: lsp-edit.ts <project-dir> <file> <from> <to>')
}
const project = resolve(projectArgument)
const probed = resolve(project, fileArgument)

const listTs = (directory: string): string[] =>
	readdirSync(directory).flatMap((entry) => {
		const path = join(directory, entry)
		if (entry === 'node_modules') return []
		if (statSync(path).isDirectory()) return listTs(path)
		return path.endsWith('.ts') ? [path] : []
	})

const server = spawn(process.execPath, [compiler, '--lsp', '--stdio'], {
	cwd: project,
})
let buffer = Buffer.alloc(0)
let nextId = 1
const pending = new Map<number, (message: Message) => void>()

server.stdout.on('data', (chunk: Buffer) => {
	buffer = Buffer.concat([buffer, chunk])
	for (;;) {
		const headerEnd = buffer.indexOf('\r\n\r\n')
		if (headerEnd === -1) return
		const length = Number(
			/Content-Length: (\d+)/i.exec(
				buffer.subarray(0, headerEnd).toString(),
			)?.[1],
		)
		if (buffer.length < headerEnd + 4 + length) return
		const body = buffer
			.subarray(headerEnd + 4, headerEnd + 4 + length)
			.toString()
		buffer = buffer.subarray(headerEnd + 4 + length)
		const message = toMessage(JSON.parse(body))
		if (typeof message.id === 'number' && message.method === undefined) {
			pending.get(message.id)?.(message)
			pending.delete(message.id)
		} else if (message.id !== undefined) {
			// Answer server requests (configuration, capability registration) with null.
			send({ id: message.id, result: null })
		}
	}
})

const send = (message: object): void => {
	const body = JSON.stringify({ jsonrpc: '2.0', ...message })
	server.stdin.write(
		`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`,
	)
}
const request = async (method: string, params: unknown): Promise<unknown> => {
	const id = nextId
	nextId += 1
	const message = await new Promise<Message>((done) => {
		pending.set(id, done)
		send({ id, method, params })
	})
	if (message.error !== undefined)
		throw new Error(`${method}: ${JSON.stringify(message.error)}`)
	return message.result
}
const notify = (method: string, params: unknown): void =>
	send({ method, params })

const uri = (path: string): string => pathToFileURL(path).href
const versions = new Map<string, number>()
const errors = async (path: string): Promise<Diagnostic[]> => {
	const result = await request('textDocument/diagnostic', {
		textDocument: { uri: uri(path) },
	})
	return toDiagnostics(result).filter(
		(item) => item.severity === undefined || item.severity <= 2,
	)
}

await request('initialize', {
	processId: process.pid,
	rootUri: uri(project),
	workspaceFolders: [{ uri: uri(project), name: 'bench' }],
	capabilities: { textDocument: { diagnostic: {}, synchronization: {} } },
})
notify('initialized', {})
for (const path of listTs(project)) {
	versions.set(path, 1)
	notify('textDocument/didOpen', {
		textDocument: {
			uri: uri(path),
			languageId: 'typescript',
			version: 1,
			text: readFileSync(path, 'utf8'),
		},
	})
}

let start = performance.now()
const first = await errors(probed)
const firstMs = performance.now() - start

const text = readFileSync(probed, 'utf8')
if (!text.includes(from)) throw new Error(`edit marker not found: ${from}`)
notify('textDocument/didChange', {
	textDocument: { uri: uri(probed), version: (versions.get(probed) ?? 1) + 1 },
	contentChanges: [{ text: text.replace(from, to) }],
})
start = performance.now()
const edited = await errors(probed)
const editMs = performance.now() - start

await request('shutdown', undefined)
notify('exit', undefined)
console.log(
	JSON.stringify({
		project,
		firstMs: Math.round(firstMs),
		firstErrors: first.length,
		editMs: Math.round(editMs),
		editErrors: edited.length,
		editFirstMessage: edited[0]?.message.split('\n')[0]?.slice(0, 120) ?? null,
	}),
)

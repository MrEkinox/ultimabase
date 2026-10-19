// Minimal LSP client for the TypeScript 7 native server (`tsc --lsp --stdio`).
// Used because TypeScript 7 no longer ships the JavaScript language service
// (no createLanguageService / getQuickInfoAtPosition): hovers, completions and
// diagnostics are requested the way an editor does.
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { pathToFileURL } from 'node:url'

export const TS7_EXE = '/Users/mrekinox/Desktop/ub-typing-spike/ts7/node_modules/@typescript/typescript-darwin-x64/lib/tsc'
export const uri = (file) => pathToFileURL(path.resolve(file)).href

export const startServer = async (rootDir, { exe = TS7_EXE, args = ['--lsp', '--stdio'] } = {}) => {
	const child = spawn(exe, args, { cwd: rootDir, stdio: ['pipe', 'pipe', 'pipe'] })
	let buffer = Buffer.alloc(0)
	let nextId = 1
	const pending = new Map()
	const notifications = []
	const stderr = []
	child.stderr.on('data', (d) => stderr.push(String(d)))
	const send = (message) => {
		const body = Buffer.from(JSON.stringify({ jsonrpc: '2.0', ...message }), 'utf8')
		child.stdin.write(`Content-Length: ${body.length}\r\n\r\n`)
		child.stdin.write(body)
	}
	child.stdout.on('data', (chunk) => {
		buffer = Buffer.concat([buffer, chunk])
		for (;;) {
			const headerEnd = buffer.indexOf('\r\n\r\n')
			if (headerEnd < 0) return
			const header = buffer.subarray(0, headerEnd).toString('utf8')
			const length = Number(/Content-Length: (\d+)/i.exec(header)?.[1])
			if (buffer.length < headerEnd + 4 + length) return
			const message = JSON.parse(buffer.subarray(headerEnd + 4, headerEnd + 4 + length).toString('utf8'))
			buffer = buffer.subarray(headerEnd + 4 + length)
			if (message.id !== undefined && message.method === undefined) {
				const p = pending.get(message.id)
				pending.delete(message.id)
				if (message.error) p?.reject(new Error(`${message.error.code} ${message.error.message}`))
				else p?.resolve(message.result)
			} else if (message.id !== undefined && message.method) {
				// Server -> client request (workspace/configuration, client/registerCapability...).
				const result = message.method === 'workspace/configuration' ? (message.params?.items ?? []).map(() => null) : null
				send({ id: message.id, result })
			} else notifications.push(message)
		}
	})
	const request = (method, params) =>
		new Promise((resolve, reject) => {
			const id = nextId++
			pending.set(id, { resolve, reject })
			send({ id, method, params })
		})
	const notify = (method, params) => send({ method, params })
	const init = await request('initialize', {
		processId: process.pid,
		rootUri: uri(rootDir),
		workspaceFolders: [{ uri: uri(rootDir), name: path.basename(rootDir) }],
		capabilities: {
			textDocument: {
				hover: { contentFormat: ['markdown', 'plaintext'] },
				completion: { completionItem: { snippetSupport: false } },
				diagnostic: { dynamicRegistration: false },
				publishDiagnostics: {},
				synchronization: { didSave: false },
			},
			workspace: { configuration: true },
		},
	})
	notify('initialized', {})
	const docs = new Map()
	const open = (file, text = fs.readFileSync(file, 'utf8')) => {
		const key = path.resolve(file)
		if (docs.has(key)) return
		docs.set(key, { text, version: 1 })
		notify('textDocument/didOpen', { textDocument: { uri: uri(key), languageId: 'typescript', version: 1, text } })
	}
	const change = (file, text) => {
		const key = path.resolve(file)
		if (!docs.has(key)) open(key)
		const doc = docs.get(key)
		doc.text = text
		doc.version += 1
		notify('textDocument/didChange', { textDocument: { uri: uri(key), version: doc.version }, contentChanges: [{ text }] })
	}
	const text = (file) => docs.get(path.resolve(file))?.text ?? fs.readFileSync(file, 'utf8')
	const position = (file, offset) => {
		const before = text(file).slice(0, offset)
		const lines = before.split('\n')
		// LSP positions are UTF-16 code units, like JavaScript string indices.
		return { line: lines.length - 1, character: lines.at(-1).length }
	}
	const hover = async (file, offset) => {
		open(file)
		const result = await request('textDocument/hover', { textDocument: { uri: uri(file) }, position: position(file, offset) })
		return result
	}
	const completion = async (file, offset) => {
		open(file)
		return request('textDocument/completion', { textDocument: { uri: uri(file) }, position: position(file, offset) })
	}
	const diagnostics = async (file) => {
		open(file)
		const result = await request('textDocument/diagnostic', { textDocument: { uri: uri(file) } })
		return result?.items ?? []
	}
	const close = async () => {
		try {
			await request('shutdown', null)
			notify('exit', null)
		} catch {}
		child.kill()
	}
	return { init, request, notify, open, change, text, hover, completion, diagnostics, close, child, stderr, notifications }
}

// Extracts the code part of a markdown hover (```typescript ... ```), comparable to
// TS6 displayPartsToString(quickInfo.displayParts).
export const hoverCode = (result) => {
	if (!result) return '(none)'
	const value = typeof result.contents === 'string' ? result.contents : (result.contents.value ?? '')
	const m = /```(?:typescript|ts|tsx)?\n([\s\S]*?)\n```/.exec(value)
	return m ? m[1] : value
}

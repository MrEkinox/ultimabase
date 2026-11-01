// The schema file `generated` names (D-191): written by `ultimabase dev`,
// with `extend` applied, only when its content changed.
import { mkdtemp, readFile, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { extendSchema, parse } from 'graphql'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { started } from './test/app.ts'

const written = (lines: readonly { readonly first: unknown }[]) =>
	lines.filter(
		(line) =>
			typeof line.first === 'string' &&
			line.first.startsWith('GraphQL schema written'),
	)

async function file(): Promise<string> {
	const folder = await mkdtemp(join(tmpdir(), 'ultimabase-graphql-'))
	return join(folder, 'src', 'generated', 'schema.graphql')
}

describe('the generated schema file (D-191)', () => {
	afterEach(() => {
		vi.unstubAllEnvs()
	})

	it('is written in development, extend applied, its folders created', async () => {
		vi.stubEnv('NODE_ENV', 'development')
		const path = await file()
		const { app, lines } = await started({
			generated: path,
			extend: (schema) =>
				extendSchema(schema, parse('extend type Query { hello: String }')),
		})
		await app.stop()
		const printed = await readFile(path, 'utf8')
		expect(printed).toContain('type Post {')
		expect(printed).toContain('hello: String')
		expect(printed.endsWith('}\n')).toBe(true)
		expect(written(lines).map((line) => line.first)).toEqual([
			`GraphQL schema written to ${path}.`,
		])
	})

	it('is left as it is when its content did not change', async () => {
		vi.stubEnv('NODE_ENV', 'development')
		const path = await file()
		const first = await started({ generated: path })
		await first.app.stop()
		const before = await stat(path)
		const second = await started({ generated: path })
		await second.app.stop()
		expect((await stat(path)).mtimeMs).toBe(before.mtimeMs)
		expect(written(second.lines)).toEqual([])
	})

	it('is not written outside development', async () => {
		const path = await file()
		const { app, lines } = await started({ generated: path })
		await app.stop()
		await expect(stat(path)).rejects.toThrow('ENOENT')
		expect(written(lines)).toEqual([])
	})
})

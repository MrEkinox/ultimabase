import {
	existsSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	rmSync,
	statSync,
	symlinkSync,
	writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { resolveSelection } from './config.js'
import { createProject } from './generate.js'

const directories: string[] = []
const root = (): string => {
	const directory = mkdtempSync(
		path.join(tmpdir(), 'ultimabase-generate-test-'),
	)
	directories.push(directory)
	return directory
}

afterEach(() => {
	for (const directory of directories.splice(0))
		rmSync(directory, { recursive: true, force: true })
})

describe('project generation', () => {
	it('writes an empty JavaScript project without installation', async () => {
		const cwd = root()
		const plan = resolveSelection(
			{ name: 'notes', language: 'js', starter: 'empty', install: false },
			cwd,
		)
		await createProject(plan)
		expect(existsSync(path.join(plan.destination, 'src/main.js'))).toBe(true)
		expect(existsSync(path.join(plan.destination, 'tsconfig.json'))).toBe(false)
		expect(existsSync(path.join(plan.destination, '.env'))).toBe(false)
	})

	it('creates an ignored secret with owner-only permissions for Docker', async () => {
		const cwd = root()
		const plan = resolveSelection(
			{ name: 'notes', database: 'docker', install: false },
			cwd,
		)
		await createProject(plan)
		const env = readFileSync(path.join(plan.destination, '.env'), 'utf8')
		expect(env).toMatch(/POSTGRES_PASSWORD=[0-9a-f]{48}/)
		expect(statSync(path.join(plan.destination, '.env')).mode & 0o777).toBe(
			0o600,
		)
		expect(readdirSync(cwd)).toEqual(['notes'])
	})

	it('protects existing paths, including symlinks, without changing them', async () => {
		const cwd = root()
		const occupied = path.join(cwd, 'notes')
		writeFileSync(occupied, 'keep me')
		const plan = {
			...resolveSelection(
				{ name: 'notes', directory: 'new-notes', install: false },
				cwd,
			),
			destination: occupied,
		}
		await expect(createProject(plan)).rejects.toThrow()
		expect(readFileSync(occupied, 'utf8')).toBe('keep me')
		const link = path.join(cwd, 'link')
		symlinkSync(path.join(cwd, 'missing'), link)
		await expect(
			createProject({ ...plan, destination: link }),
		).rejects.toThrow()
		expect(readdirSync(cwd).sort()).toEqual(['link', 'notes'])
	})

	it('rolls back temporary files after installation fails', async () => {
		const cwd = root()
		const plan = resolveSelection({ name: 'notes', install: true }, cwd)
		await expect(
			createProject(plan, {
				installDependencies: () => Promise.reject(new Error('offline')),
			}),
		).rejects.toThrow('offline')
		expect(readdirSync(cwd)).toEqual([])
	})

	it('passes the selected manager to the installer before committing', async () => {
		const cwd = root()
		const plan = resolveSelection(
			{ name: 'notes', packageManager: 'yarn', install: true },
			cwd,
		)
		let invocation: [string, string] | undefined
		await createProject(plan, {
			installDependencies: (directory, manager) => {
				invocation = [directory, manager]
				return Promise.resolve()
			},
		})
		expect(invocation?.[1]).toBe('yarn')
		expect(invocation?.[0]).not.toBe(plan.destination)
		expect(existsSync(plan.destination)).toBe(true)
	})

	it('rejects optional selections before writing until their templates land', async () => {
		const cwd = root()
		const plan = resolveSelection(
			{ name: 'notes', plugins: ['hooks-plugin'], install: false },
			cwd,
		)
		await expect(createProject(plan)).rejects.toThrow('not implemented yet')
		expect(readdirSync(cwd)).toEqual([])
	})

	it('does not expose a Docker secret to dependency installation', async () => {
		const cwd = root()
		const plan = resolveSelection(
			{ name: 'notes', database: 'docker', install: true },
			cwd,
		)
		await createProject(plan, {
			installDependencies: (directory) => {
				expect(existsSync(path.join(directory, '.env'))).toBe(false)
				return Promise.resolve()
			},
		})
		expect(existsSync(path.join(plan.destination, '.env'))).toBe(true)
	})
})

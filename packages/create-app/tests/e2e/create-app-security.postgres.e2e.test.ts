import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

import {
	createProject,
	resolveSelection,
	type PluginId,
} from '@ultimabase/create-app'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
	createPostgresWorkerFixture,
	type PostgresWorkerFixture,
} from '../../../../tests/fixtures/postgres-worker-fixture.js'

const execFileAsync = promisify(execFile)
let fixture: PostgresWorkerFixture | undefined

beforeAll(async () => {
	fixture = await createPostgresWorkerFixture({ prefix: 'create_app_security' })
}, 30_000)

afterAll(async () => {
	await fixture?.dispose()
})

const generate = async (
	language: 'ts' | 'js',
	plugins: readonly PluginId[],
): Promise<{ readonly destination: string; dispose(): Promise<void> }> => {
	if (fixture === undefined)
		throw new TypeError('PostgreSQL fixture is unavailable')
	const parent = await mkdtemp(
		path.join(tmpdir(), 'ultimabase-security-project-'),
	)
	try {
		const plan = resolveSelection(
			{ name: 'security-app', language, plugins, install: false },
			parent,
		)
		await createProject(plan)
		// Resolve workspace packages independently of root or package-local invocation.
		await symlink(
			path.resolve(import.meta.dirname, '../../../../node_modules'),
			path.join(plan.destination, 'node_modules'),
		)
		await writeFile(
			path.join(plan.destination, '.env'),
			`DATABASE_URL=${fixture.connectionUri}\n`,
			{ mode: 0o600 },
		)
		return {
			destination: plan.destination,
			dispose: () => rm(parent, { recursive: true, force: true }),
		}
	} catch (error) {
		await rm(parent, { recursive: true, force: true })
		throw error
	}
}

const runVerification = async (
	destination: string,
	source: string,
): Promise<string> => {
	await writeFile(path.join(destination, 'verify.mjs'), source)
	const { stdout, stderr } = await execFileAsync(
		process.execPath,
		['--env-file=.env', 'verify.mjs'],
		{ cwd: destination, maxBuffer: 1024 * 1024 },
	)
	return stdout + stderr
}

describe('generated security applications with PostgreSQL', () => {
	it('limits generated User reads to the session owner in JavaScript', async () => {
		const project = await generate('js', ['auth-plugin', 'access-plugin'])
		try {
			const output = await runVerification(
				project.destination,
				`import assert from 'node:assert/strict'
import { authPlugin } from '@ultimabase/auth-plugin'
import { ultimabase } from './src/ultimabase.js'
import { AppUser } from './src/schemas/user.js'

await ultimabase.start()
try {
  const auth = ultimabase.plugin(authPlugin)
  const signUp = (email) => AppUser.signUp({ email, password: 'correct horse battery staple' })
  const alice = await signUp('alice@example.test')
  const bob = await signUp('bob@example.test')
  assert.equal(alice.user.email, 'alice@example.test')
  assert.equal(bob.user.email, 'bob@example.test')
  // isSelf denies a caller without a session, like false (ADR-0341).
  await assert.rejects(AppUser.findMany(), { code: 'PERMISSION_DENIED' })
  await auth.runWithSession(alice.session.token, async () => {
    const users = await AppUser.findMany()
    assert.deepEqual(users.map(user => user.id), [alice.user.id])
    assert.equal(await AppUser.findOne({ where: { id: { eq: bob.user.id } } }), null)
    // The profile rule must not grant writes, even to the caller's own User.
    await assert.rejects(AppUser.updateOne({ where: { id: { eq: alice.user.id } }, data: { displayName: 'Changed' } }), { code: 'PERMISSION_DENIED' })
  })
  console.log('OWN_PROFILE_PASS')
} finally {
  await ultimabase.dispose()
}
`,
			)
			expect(output).toContain('OWN_PROFILE_PASS')
		} finally {
			await project.dispose()
		}
	}, 60_000)

	it('keeps password identity separate from role-backed ACL access', async () => {
		const project = await generate('js', [
			'auth-plugin',
			'roles-plugin',
			'acl-permissions-plugin',
		])
		try {
			const application = await readFile(
				path.join(project.destination, 'src/ultimabase.js'),
				'utf8',
			)
			expect(application).not.toContain('restPlugin(')
			expect(application).not.toContain('graphqlPlugin(')
			const output = await runVerification(
				project.destination,
				`import { ACL } from '@ultimabase/acl-permissions-plugin'
import { authPlugin } from '@ultimabase/auth-plugin'
import { ultimabase } from './src/ultimabase.js'
import { AppRole } from './src/schemas/role.js'
import { AppUser } from './src/schemas/user.js'
import { Task } from './src/schemas/task.js'

await ultimabase.start()
try {
  const signed = await AppUser.signUp({
    email: 'acl-alice@example.test', password: 'correct horse battery staple',
  })
  const role = await AppRole.createOne({ data: { name: 'editor' } }, { useMasterKey: true })
  await AppRole.updateOne({ where: { id: { eq: role.id } }, data: { members: { connect: [signed.principal.user.id] } } }, { useMasterKey: true })
  const task = await Task.createOne({ data: {
    title: 'Role-owned task',
    acl: new ACL().grantRole(AppRole.role({ id: role.id }), 'read'),
  } }, { useMasterKey: true })
  const input = { where: { id: { eq: task.id } }, select: { title: true } }
  const anonymous = await Task.findOne(input)
  if (anonymous !== null) throw new Error('Anonymous read unexpectedly succeeded')
  const auth = ultimabase.plugin(authPlugin)
  const member = await auth.runWithSession(signed.session.token, () => Task.findOne(input))
  if (member?.title !== 'Role-owned task') throw new Error('Role-backed ACL did not grant read')
  console.log('ROLE_ACL_PASS')
} finally {
  await ultimabase.dispose()
}
`,
			)
			expect(output).toContain('ROLE_ACL_PASS')
		} finally {
			await project.dispose()
		}
	}, 60_000)

	// ADR-0327: Access starts as a prototype, so the empty ACL is what hides
	// Tasks in development; production refusal is tested with the starter.
	it('hides Tasks through the empty ACL and audits trusted Master use in TypeScript', async () => {
		const project = await generate('ts', [
			'auth-plugin',
			'roles-plugin',
			'acl-permissions-plugin',
			'access-plugin',
		])
		try {
			await execFileAsync('npm', ['run', 'build'], {
				cwd: project.destination,
				maxBuffer: 1024 * 1024,
			})
			const output = await runVerification(
				project.destination,
				`import { ultimabase } from './dist/ultimabase.js'
import { Task } from './dist/schemas/task.js'

const audit = []
const originalInfo = console.info
console.info = (label, metadata) => audit.push({ label, metadata })
await ultimabase.start()
try {
  await Task.createOne({ data: { title: 'Private task' } }, { useMasterKey: true })
  if ((await Task.findOne({ select: { title: true } })) !== null) {
    throw new Error('The empty ACL did not hide the Task')
  }
  if (!audit.some(({ label, metadata }) => label === 'Master authority used' && metadata?.kind === 'master-access')) {
    throw new Error('Master audit event is missing')
  }
  originalInfo('ACCESS_AUDIT_PASS')
} finally {
  console.info = originalInfo
  await ultimabase.dispose()
}
`,
			)
			expect(output).toContain('ACCESS_AUDIT_PASS')
		} finally {
			await project.dispose()
		}
	}, 60_000)
})

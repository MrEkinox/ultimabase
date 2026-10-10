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
const masterKey = 'local-test-only-master-key'
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
			`DATABASE_URL=${fixture.connectionUri}\nULTIMABASE_MASTER_KEY=${masterKey}\n`,
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
		const project = await generate('js', [
			'password-auth-plugin',
			'access-plugin',
		])
		try {
			const output = await runVerification(
				project.destination,
				`import assert from 'node:assert/strict'
import { passwordAuthOperations } from '@ultimabase/password-auth-plugin'
import { ultimabase } from './src/ultimabase.js'
import { AppUser } from './src/schema.js'

await ultimabase.start()
try {
  const auth = ultimabase.plugin('@ultimabase/password-auth-plugin')
  const signUp = (username) => ultimabase.operation(passwordAuthOperations.signUp).execute({ username, password: 'correct horse battery staple' })
  const alice = await signUp('profile-alice')
  const bob = await signUp('profile-bob')
  assert.equal(alice.user.username, 'profile-alice')
  assert.equal(bob.user.username, 'profile-bob')
  assert.deepEqual(await AppUser.findMany(), [])
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
			'password-auth-plugin',
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
import { passwordAuthOperations } from '@ultimabase/password-auth-plugin'
import { ultimabase } from './src/ultimabase.js'
import { AppRole, Task } from './src/schema.js'

await ultimabase.start()
try {
  const signed = await ultimabase.operation(passwordAuthOperations.signUp).execute({
    username: 'alice', password: 'correct horse battery staple',
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
  const auth = ultimabase.plugin('@ultimabase/password-auth-plugin')
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

	it('denies ordinary access and audits trusted Master use in TypeScript', async () => {
		const project = await generate('ts', [
			'password-auth-plugin',
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
import { AppRole, Task } from './dist/schema.js'

const audit = []
const originalInfo = console.info
console.info = (label, metadata) => audit.push({ label, metadata })
await ultimabase.start()
try {
  await Task.createOne({ data: { title: 'Private task' } }, { useMasterKey: true })
  for (const operation of [
    () => Task.findOne({ select: { title: true } }),
    () => AppRole.findMany(),
    () => Task.createOne({ data: { title: 'Denied task' } }),
  ]) {
    let denied = false
    try { await operation() } catch (error) { denied = error?.code === 'PERMISSION_DENIED' }
    if (!denied) throw new Error('Access did not deny an ordinary operation')
  }
  if (!audit.some(({ label, metadata }) => label === 'Master authority used' && metadata?.kind === 'master-access')) {
    throw new Error('Master audit event is missing')
  }
  if (JSON.stringify(audit).includes(process.env.ULTIMABASE_MASTER_KEY)) {
    throw new Error('Master key leaked into audit')
  }
  originalInfo('ACCESS_AUDIT_PASS')
} finally {
  console.info = originalInfo
  await ultimabase.dispose()
}
`,
			)
			expect(output).toContain('ACCESS_AUDIT_PASS')
			expect(output).not.toContain(masterKey)
		} finally {
			await project.dispose()
		}
	}, 60_000)
})

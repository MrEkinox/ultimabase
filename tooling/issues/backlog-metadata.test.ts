import path from 'node:path'

import { describe, expect, it } from 'vitest'

import {
	validateBacklog,
	validateBacklogSources,
	type BacklogDiagnosticCode,
} from './backlog-metadata.js'
import type { BacklogIssueSource, BacklogSources } from './backlog-sources.js'

const repositoryRoot = path.resolve(import.meta.dirname, '../..')

const milestoneSource = {
	contents: '# Milestone 1\n\n- Status: planned\n',
	file: 'issues/100-fixture/README.md',
	id: 1,
} as const

const issueSource = (
	id: number,
	metadata: string,
	file = `issues/100-fixture/${String(id)}-fixture.md`,
): BacklogIssueSource => ({
	contents: `# ${String(id)}: Fixture\n\n${metadata}\n`,
	file,
	id,
})

const validSources = (): BacklogSources => ({
	issues: [
		issueSource(101, '- Status: completed\n- Milestone: 1\n- Depends on: none'),
		issueSource(102, '- Status: ready\n- Milestone: 1\n- Depends on: 101'),
		issueSource(
			103,
			'- Status: merged\n- Merged into: 101\n- Milestone: 1\n- Depends on: 101',
		),
	],
	milestones: [milestoneSource],
})

const diagnosticCodes = (
	sources: BacklogSources,
): readonly BacklogDiagnosticCode[] =>
	validateBacklogSources(sources).map(({ code }) => code)

describe('backlog metadata validation', () => {
	it('accepts the normalized repository backlog', () => {
		expect(validateBacklog(repositoryRoot)).toEqual([])
	})

	it('rejects unknown statuses', () => {
		const sources = validSources()
		const unknown = issueSource(
			104,
			'- Status: done\n- Milestone: 1\n- Depends on: 101',
		)

		expect(
			diagnosticCodes({ ...sources, issues: [...sources.issues, unknown] }),
		).toContain('ISSUE_STATUS_UNKNOWN')
	})

	it('rejects missing and malformed dependencies', () => {
		const sources = validSources()
		const missing = issueSource(104, '- Status: planned\n- Milestone: 1')
		const malformed = issueSource(
			105,
			'- Status: planned\n- Milestone: 1\n- Depends on: 101,102',
		)

		const codes = diagnosticCodes({
			...sources,
			issues: [...sources.issues, missing, malformed],
		})
		expect(codes).toContain('ISSUE_DEPENDENCIES_MISSING')
		expect(codes).toContain('ISSUE_DEPENDENCIES_MALFORMED')
	})

	it('rejects dependencies whose issue does not exist', () => {
		const sources = validSources()
		const unknown = issueSource(
			104,
			'- Status: planned\n- Milestone: 1\n- Depends on: 9999',
		)

		expect(
			diagnosticCodes({ ...sources, issues: [...sources.issues, unknown] }),
		).toContain('ISSUE_DEPENDENCY_UNKNOWN')
	})

	it('rejects issue references to a missing milestone', () => {
		const sources = validSources()
		const missingMilestone = issueSource(
			201,
			'- Status: planned\n- Milestone: 2\n- Depends on: 101',
			'issues/200-fixture/201-fixture.md',
		)

		expect(
			diagnosticCodes({
				...sources,
				issues: [...sources.issues, missingMilestone],
			}),
		).toContain('ISSUE_MILESTONE_REFERENCE_MISSING')
	})

	it.each([
		[
			'missing target',
			'- Status: merged\n- Milestone: 1\n- Depends on: 101',
			'ISSUE_MERGE_TARGET_MISSING',
		],
		[
			'malformed target',
			'- Status: merged\n- Merged into: issue 101\n- Milestone: 1\n- Depends on: 101',
			'ISSUE_MERGE_TARGET_MALFORMED',
		],
		[
			'unknown target',
			'- Status: merged\n- Merged into: 9999\n- Milestone: 1\n- Depends on: 9999',
			'ISSUE_MERGE_TARGET_UNKNOWN',
		],
		[
			'target absent from dependencies',
			'- Status: merged\n- Merged into: 101\n- Milestone: 1\n- Depends on: 102',
			'ISSUE_MERGE_TARGET_NOT_DEPENDENCY',
		],
	] as const)('rejects merged state with a %s', (_, metadata, expectedCode) => {
		const sources = validSources()
		const merged = issueSource(104, metadata)

		expect(
			diagnosticCodes({ ...sources, issues: [...sources.issues, merged] }),
		).toContain(expectedCode)
	})
})

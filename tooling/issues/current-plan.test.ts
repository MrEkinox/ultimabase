import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { readBacklogSources, type BacklogSources } from './backlog-sources.js'

const repositoryRoot = path.resolve(import.meta.dirname, '../..')
const readDocument = (file: string): string =>
	fs.readFileSync(path.join(repositoryRoot, file), 'utf8')

const metadata = (contents: string, field: string): string => {
	const prefix = `- ${field}: `
	const values = contents
		.split('\n')
		.filter((line) => line.startsWith(prefix))
		.map((line) => line.slice(prefix.length).trim())
	if (values.length !== 1 || values[0] === undefined || values[0] === '') {
		throw new TypeError(`Expected exactly one ${field}`)
	}
	return values[0]
}

const section = (contents: string, name: string): string => {
	const heading = `## ${name}\n`
	const start = contents.indexOf(heading)
	if (start < 0) throw new TypeError(`Missing ${name} section`)
	const end = contents.indexOf('\n## ', start + heading.length)
	return contents.slice(start + heading.length, end < 0 ? undefined : end)
}

/** Check current structured state only; old execution logs never grant authority. */
const checkCheckpoint = (
	plan: string,
	catalog: string,
	sources: BacklogSources,
): void => {
	if (plan.trimEnd().split('\n').length > 80) {
		throw new TypeError(
			'Current plan exceeds 80 lines; archive detailed evidence',
		)
	}
	for (const heading of [
		'Objective',
		'Locked decisions',
		'Blocker',
		'Next verifiable action',
	]) {
		if (section(plan, heading).trim() === '') {
			throw new TypeError(`Empty checkpoint section: ${heading}`)
		}
	}
	const status = metadata(plan, 'Status')
	if (!['in-progress', 'paused', 'completed'].includes(status)) {
		throw new TypeError('Invalid current plan status')
	}
	const milestoneId = metadata(plan, 'Milestone')
	const milestone = sources.milestones.find(
		({ id }) => String(id) === milestoneId,
	)
	if (milestone === undefined) throw new TypeError('Unknown current milestone')
	const milestoneStatus = metadata(milestone.contents, 'Status')
	if (status === 'completed' && milestoneStatus !== 'completed') {
		throw new TypeError('Completed plan has an unfinished milestone')
	}
	if (status !== 'completed' && milestoneStatus === 'completed') {
		throw new TypeError('Active or paused plan has a completed milestone')
	}
	if (status === 'in-progress' && milestoneStatus !== 'in-progress') {
		throw new TypeError('Active plan milestone is not in progress')
	}
	// Check only the selected milestone's execution checklist, not old issue prose.
	for (const [, checked, id] of milestone.contents.matchAll(
		/^- \[([ x])\] \[(\d+):/gmu,
	)) {
		const issue = sources.issues.find((source) => String(source.id) === id)
		if (issue === undefined)
			throw new TypeError('Checklist names unknown issue')
		const terminal = ['completed', 'merged', 'superseded'].includes(
			metadata(issue.contents, 'Status'),
		)
		if ((checked === 'x') !== terminal) {
			throw new TypeError('Milestone execution checkbox is stale')
		}
	}
	const activeId = metadata(plan, 'Active issue')
	if (status === 'completed') {
		if (activeId !== 'none' || metadata(plan, 'Next issue') !== 'none') {
			throw new TypeError('Completed plan must not schedule another issue')
		}
	} else {
		const issue = sources.issues.find(({ id }) => String(id) === activeId)
		if (issue === undefined) throw new TypeError('Unknown active issue')
		if (metadata(issue.contents, 'Milestone') !== milestoneId) {
			throw new TypeError('Active issue belongs to another milestone')
		}
		const issueStatus = metadata(issue.contents, 'Status')
		const allowed =
			status === 'paused'
				? ['in-progress', 'blocked', 'ready', 'planned']
				: ['in-progress']
		if (!allowed.includes(issueStatus))
			throw new TypeError('Active issue status is stale')
		const context = section(issue.contents, 'Working context')
		for (const field of [
			'Scope',
			'Current contracts',
			'Locked decisions',
			'Rejected approaches',
			'Proof commands',
			'Exploration budget',
			'Next action',
		]) {
			metadata(context, field)
		}
	}

	for (const state of ['Active', 'Paused', 'Completed']) {
		const entries = section(catalog, state)
		const ids = [...entries.matchAll(/milestone (\d+)\b/gu)].map(
			(match) => match[1],
		)
		for (const id of ids) {
			const target = sources.milestones.find(
				(source) => String(source.id) === id,
			)
			if (target === undefined)
				throw new TypeError('Catalog names unknown milestone')
			const complete = metadata(target.contents, 'Status') === 'completed'
			if ((state === 'Completed') !== complete) {
				throw new TypeError('Plan catalog milestone status is stale')
			}
		}
		const expected =
			status === 'in-progress'
				? 'Active'
				: status === 'paused'
					? 'Paused'
					: 'Completed'
		if (state === expected && !ids.includes(milestoneId)) {
			throw new TypeError('Current checkpoint is absent from the plan catalog')
		}
	}
}

const fixturePlan = `# Current plan: Fixture

- Status: in-progress
- Milestone: 1
- Active issue: 101
- Next issue: none

## Objective

Deliver the scoped issue.

## Locked decisions

No capability loss.

## Blocker

None.

## Next verifiable action

Run the focused proof.
`
const fixtureCatalog = `## Active

- Fixture, milestone 1.

## Paused

None.

## Completed

None.
`
const fixtureSources = {
	issues: [
		{
			id: 101,
			file: 'issues/100-fixture/101-fixture.md',
			contents: `- Status: in-progress
- Milestone: 1
- Depends on: none

## Working context

- Scope: fixture only
- Current contracts: existing guide
- Locked decisions: no API change
- Rejected approaches: none
- Proof commands: focused test
- Exploration budget: two failures or 30 minutes
- Next action: run proof
`,
		},
	],
	milestones: [
		{
			id: 1,
			file: 'issues/100-fixture/README.md',
			contents: '- Status: in-progress\n',
		},
	],
} as const satisfies BacklogSources

describe('current execution checkpoint', () => {
	it('keeps the real plan, issue and catalog aligned', () => {
		checkCheckpoint(
			readDocument('CURRENT_PLAN.md'),
			readDocument('docs/plans/README.md'),
			readBacklogSources(repositoryRoot),
		)
	})

	it('accepts active and completed checkpoints without inspecting historical issues', () => {
		checkCheckpoint(fixturePlan, fixtureCatalog, fixtureSources)
		checkCheckpoint(
			fixturePlan.replace('Status: in-progress', 'Status: paused'),
			fixtureCatalog
				.replace('## Active', '## Temporary')
				.replace('## Paused', '## Active')
				.replace('## Temporary', '## Paused'),
			fixtureSources,
		)
		checkCheckpoint(
			fixturePlan
				.replace('Status: in-progress', 'Status: completed')
				.replace('Active issue: 101', 'Active issue: none'),
			fixtureCatalog
				.replace('- Fixture, milestone 1.', 'None.')
				.replace(
					'## Completed\n\nNone.',
					'## Completed\n\n- Fixture, milestone 1.',
				),
			{
				...fixtureSources,
				issues: [],
				milestones: [
					{
						...fixtureSources.milestones[0],
						contents: '- Status: completed\n',
					},
				],
			},
		)
	})

	it.each([
		[
			'oversized log',
			fixturePlan + 'Historical entry\n'.repeat(81),
			'exceeds 80 lines',
		],
		[
			'unknown issue',
			fixturePlan.replace('Active issue: 101', 'Active issue: 999'),
			'Unknown active issue',
		],
		[
			'missing state',
			fixturePlan.replace('- Status: in-progress', ''),
			'Expected exactly one Status',
		],
		[
			'duplicate state',
			fixturePlan + '\n- Status: completed',
			'Expected exactly one Status',
		],
		[
			'missing action',
			fixturePlan.replace('## Next verifiable action', '## Historical action'),
			'Missing Next verifiable action',
		],
		[
			'invalid state',
			fixturePlan.replace('Status: in-progress', 'Status: done'),
			'Invalid current plan status',
		],
	] as const)('rejects %s', (_, plan, message) => {
		expect(() => {
			checkCheckpoint(plan, fixtureCatalog, fixtureSources)
		}).toThrow(message)
	})

	it('rejects completed issues still selected as active', () => {
		const issue = fixtureSources.issues[0]
		expect(() => {
			checkCheckpoint(fixturePlan, fixtureCatalog, {
				...fixtureSources,
				issues: [
					{
						...issue,
						contents: issue.contents.replace(
							'Status: in-progress',
							'Status: completed',
						),
					},
				],
			})
		}).toThrow('Active issue status is stale')
	})

	it('requires bounded working context on the active issue', () => {
		const issue = fixtureSources.issues[0]
		expect(() => {
			checkCheckpoint(fixturePlan, fixtureCatalog, {
				...fixtureSources,
				issues: [
					{
						...issue,
						contents: issue.contents.replace('- Rejected approaches: none', ''),
					},
				],
			})
		}).toThrow('Expected exactly one Rejected approaches')
	})

	it('rejects completed milestones retained in the active catalog', () => {
		const milestone = fixtureSources.milestones[0]
		expect(() => {
			checkCheckpoint(
				fixturePlan
					.replace('Status: in-progress', 'Status: completed')
					.replace('Active issue: 101', 'Active issue: none'),
				fixtureCatalog,
				{
					...fixtureSources,
					milestones: [{ ...milestone, contents: '- Status: completed\n' }],
				},
			)
		}).toThrow('Plan catalog milestone status is stale')
	})

	it.each(['x', ' '] as const)(
		'checks execution checkbox "%s" against issue state',
		(checked) => {
			const milestone = fixtureSources.milestones[0]
			const sources = {
				...fixtureSources,
				milestones: [
					{
						...milestone,
						contents:
							milestone.contents +
							`\n- [${checked}] [101: Fixture](101-fixture.md)\n`,
					},
				],
			}
			if (checked === ' ') {
				checkCheckpoint(fixturePlan, fixtureCatalog, sources)
			} else {
				expect(() => {
					checkCheckpoint(fixturePlan, fixtureCatalog, sources)
				}).toThrow('Milestone execution checkbox is stale')
			}
		},
	)
})

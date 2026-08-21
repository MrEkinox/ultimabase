import {
	readBacklogSources,
	type BacklogIssueSource,
	type BacklogMilestoneSource,
	type BacklogSources,
} from './backlog-sources.js'

export const issueStatuses = [
	'blocked',
	'completed',
	'deferred',
	'in-progress',
	'merged',
	'planned',
	'ready',
	'superseded',
] as const

export const milestoneStatuses = [
	'blocked',
	'completed',
	'in-progress',
	'planned',
] as const

export type IssueStatus = (typeof issueStatuses)[number]
export type MilestoneStatus = (typeof milestoneStatuses)[number]

export type BacklogDiagnosticCode =
	| 'ISSUE_DEPENDENCIES_MALFORMED'
	| 'ISSUE_DEPENDENCIES_MISSING'
	| 'ISSUE_DEPENDENCY_DUPLICATE'
	| 'ISSUE_DEPENDENCY_SELF'
	| 'ISSUE_DEPENDENCY_UNKNOWN'
	| 'ISSUE_ID_DUPLICATE'
	| 'ISSUE_MERGE_TARGET_MALFORMED'
	| 'ISSUE_MERGE_TARGET_MISSING'
	| 'ISSUE_MERGE_TARGET_NOT_DEPENDENCY'
	| 'ISSUE_MERGE_TARGET_UNEXPECTED'
	| 'ISSUE_MERGE_TARGET_UNKNOWN'
	| 'ISSUE_MILESTONE_MALFORMED'
	| 'ISSUE_MILESTONE_MISSING'
	| 'ISSUE_MILESTONE_REFERENCE_MISSING'
	| 'ISSUE_STATUS_MISSING'
	| 'ISSUE_STATUS_UNKNOWN'
	| 'METADATA_DUPLICATE'
	| 'MILESTONE_COMPLETED_WITH_ACTIVE_ISSUE'
	| 'MILESTONE_ID_DUPLICATE'
	| 'MILESTONE_STATUS_MISSING'
	| 'MILESTONE_STATUS_UNKNOWN'

export interface BacklogDiagnostic {
	readonly code: BacklogDiagnosticCode
	readonly file: string
	readonly message: string
}

interface ParsedIssue {
	readonly dependencies: readonly number[] | undefined
	readonly mergedInto: number | undefined
	readonly milestoneId: number | undefined
	readonly source: BacklogIssueSource
	readonly status: IssueStatus | undefined
}

interface ParsedMilestone {
	readonly source: BacklogMilestoneSource
	readonly status?: MilestoneStatus
}

const issueStatusSet = new Set<string>(issueStatuses)
const milestoneStatusSet = new Set<string>(milestoneStatuses)
const terminalIssueStatuses = new Set<IssueStatus>([
	'completed',
	'merged',
	'superseded',
])

const diagnostic = (
	code: BacklogDiagnosticCode,
	file: string,
	message: string,
): BacklogDiagnostic => ({ code, file, message })

const metadataValues = (contents: string, name: string): readonly string[] => {
	const prefix = `- ${name}: `
	return contents
		.split(/\r?\n/u)
		.filter((line) => line.startsWith(prefix))
		.map((line) => line.slice(prefix.length).trim())
}

const readMetadata = (
	contents: string,
	file: string,
	name: string,
	diagnostics: BacklogDiagnostic[],
): string | undefined => {
	const values = metadataValues(contents, name)
	if (values.length > 1) {
		diagnostics.push(
			diagnostic(
				'METADATA_DUPLICATE',
				file,
				`${name} must be declared exactly once`,
			),
		)
	}
	return values[0]
}

const parseDependencies = (
	value: string | undefined,
	source: BacklogIssueSource,
	diagnostics: BacklogDiagnostic[],
): readonly number[] | undefined => {
	if (value === undefined) {
		diagnostics.push(
			diagnostic(
				'ISSUE_DEPENDENCIES_MISSING',
				source.file,
				'Depends on metadata is required',
			),
		)
		return undefined
	}
	if (value === 'none') return []
	if (!/^\d+(?:, \d+)*$/u.test(value)) {
		diagnostics.push(
			diagnostic(
				'ISSUE_DEPENDENCIES_MALFORMED',
				source.file,
				'Depends on must be "none" or comma-and-space separated issue IDs',
			),
		)
		return undefined
	}

	const dependencies = value.split(', ').map(Number)
	if (new Set(dependencies).size !== dependencies.length) {
		diagnostics.push(
			diagnostic(
				'ISSUE_DEPENDENCY_DUPLICATE',
				source.file,
				'Depends on must not repeat an issue ID',
			),
		)
	}
	if (dependencies.includes(source.id)) {
		diagnostics.push(
			diagnostic(
				'ISSUE_DEPENDENCY_SELF',
				source.file,
				`Issue ${String(source.id)} cannot depend on itself`,
			),
		)
	}
	return dependencies
}

const parseIssue = (
	source: BacklogIssueSource,
	diagnostics: BacklogDiagnostic[],
): ParsedIssue => {
	const statusValue = readMetadata(
		source.contents,
		source.file,
		'Status',
		diagnostics,
	)
	let status: IssueStatus | undefined
	if (statusValue === undefined) {
		diagnostics.push(
			diagnostic('ISSUE_STATUS_MISSING', source.file, 'Status is required'),
		)
	} else if (!issueStatusSet.has(statusValue)) {
		diagnostics.push(
			diagnostic(
				'ISSUE_STATUS_UNKNOWN',
				source.file,
				`Unknown issue status: ${statusValue}`,
			),
		)
	} else {
		status = statusValue as IssueStatus
	}

	const milestoneValue = readMetadata(
		source.contents,
		source.file,
		'Milestone',
		diagnostics,
	)
	let milestoneId: number | undefined
	if (milestoneValue === undefined) {
		diagnostics.push(
			diagnostic(
				'ISSUE_MILESTONE_MISSING',
				source.file,
				'Milestone is required',
			),
		)
	} else if (milestoneValue === 'future' && status === 'deferred') {
		milestoneId = undefined
	} else if (/^\d+$/u.test(milestoneValue) || milestoneValue === '7+') {
		milestoneId = Number(milestoneValue.replace('+', ''))
	} else {
		diagnostics.push(
			diagnostic(
				'ISSUE_MILESTONE_MALFORMED',
				source.file,
				`Invalid milestone reference: ${milestoneValue}`,
			),
		)
	}

	const dependencies = parseDependencies(
		readMetadata(source.contents, source.file, 'Depends on', diagnostics),
		source,
		diagnostics,
	)
	const mergedValue = readMetadata(
		source.contents,
		source.file,
		'Merged into',
		diagnostics,
	)
	let mergedInto: number | undefined
	if (status === 'merged') {
		if (mergedValue === undefined) {
			diagnostics.push(
				diagnostic(
					'ISSUE_MERGE_TARGET_MISSING',
					source.file,
					'Merged issues require Merged into metadata',
				),
			)
		} else if (!/^\d+$/u.test(mergedValue)) {
			diagnostics.push(
				diagnostic(
					'ISSUE_MERGE_TARGET_MALFORMED',
					source.file,
					'Merged into must contain one numeric issue ID',
				),
			)
		} else {
			mergedInto = Number(mergedValue)
			if (dependencies !== undefined && !dependencies.includes(mergedInto)) {
				diagnostics.push(
					diagnostic(
						'ISSUE_MERGE_TARGET_NOT_DEPENDENCY',
						source.file,
						'Merged into must also appear in Depends on',
					),
				)
			}
		}
	} else if (mergedValue !== undefined) {
		diagnostics.push(
			diagnostic(
				'ISSUE_MERGE_TARGET_UNEXPECTED',
				source.file,
				'Merged into is valid only when Status is merged',
			),
		)
	}

	return { dependencies, mergedInto, milestoneId, source, status }
}

const parseMilestone = (
	source: BacklogMilestoneSource,
	diagnostics: BacklogDiagnostic[],
): ParsedMilestone => {
	const statusValue = readMetadata(
		source.contents,
		source.file,
		'Status',
		diagnostics,
	)
	if (statusValue === undefined) {
		diagnostics.push(
			diagnostic(
				'MILESTONE_STATUS_MISSING',
				source.file,
				'Milestone Status is required',
			),
		)
		return { source }
	}
	if (!milestoneStatusSet.has(statusValue)) {
		diagnostics.push(
			diagnostic(
				'MILESTONE_STATUS_UNKNOWN',
				source.file,
				`Unknown milestone status: ${statusValue}`,
			),
		)
		return { source }
	}
	return { source, status: statusValue as MilestoneStatus }
}

export const validateBacklogSources = (
	sources: BacklogSources,
): readonly BacklogDiagnostic[] => {
	const diagnostics: BacklogDiagnostic[] = []
	const issueIds = new Set<number>()
	for (const source of sources.issues) {
		if (issueIds.has(source.id)) {
			diagnostics.push(
				diagnostic(
					'ISSUE_ID_DUPLICATE',
					source.file,
					`Duplicate issue ID: ${String(source.id)}`,
				),
			)
		}
		issueIds.add(source.id)
	}

	const milestoneIds = new Set<number>()
	for (const source of sources.milestones) {
		if (milestoneIds.has(source.id)) {
			diagnostics.push(
				diagnostic(
					'MILESTONE_ID_DUPLICATE',
					source.file,
					`Duplicate milestone ID: ${String(source.id)}`,
				),
			)
		}
		milestoneIds.add(source.id)
	}

	const issues = sources.issues.map((source) => parseIssue(source, diagnostics))
	const milestones = sources.milestones.map((source) =>
		parseMilestone(source, diagnostics),
	)
	for (const issue of issues) {
		if (
			issue.milestoneId !== undefined &&
			!milestoneIds.has(issue.milestoneId)
		) {
			diagnostics.push(
				diagnostic(
					'ISSUE_MILESTONE_REFERENCE_MISSING',
					issue.source.file,
					`Milestone ${String(issue.milestoneId)} has no README`,
				),
			)
		}
		for (const dependency of issue.dependencies ?? []) {
			if (!issueIds.has(dependency)) {
				diagnostics.push(
					diagnostic(
						'ISSUE_DEPENDENCY_UNKNOWN',
						issue.source.file,
						`Unknown dependency issue: ${String(dependency)}`,
					),
				)
			}
		}
		if (issue.mergedInto !== undefined && !issueIds.has(issue.mergedInto)) {
			diagnostics.push(
				diagnostic(
					'ISSUE_MERGE_TARGET_UNKNOWN',
					issue.source.file,
					`Unknown merged target issue: ${String(issue.mergedInto)}`,
				),
			)
		}
	}

	for (const milestone of milestones) {
		if (milestone.status !== 'completed') continue
		for (const issue of issues) {
			if (
				issue.milestoneId === milestone.source.id &&
				issue.status !== undefined &&
				!terminalIssueStatuses.has(issue.status)
			) {
				diagnostics.push(
					diagnostic(
						'MILESTONE_COMPLETED_WITH_ACTIVE_ISSUE',
						milestone.source.file,
						`Completed milestone contains active issue ${String(issue.source.id)}`,
					),
				)
			}
		}
	}

	return diagnostics
}

export const validateBacklog = (
	repositoryRoot: string,
): readonly BacklogDiagnostic[] =>
	validateBacklogSources(readBacklogSources(repositoryRoot))

import fs from 'node:fs'
import path from 'node:path'

export interface BacklogIssueSource {
	readonly contents: string
	readonly file: string
	readonly id: number
}

export interface BacklogMilestoneSource {
	readonly contents: string
	readonly file: string
	readonly id: number
}

export interface BacklogSources {
	readonly issues: readonly BacklogIssueSource[]
	readonly milestones: readonly BacklogMilestoneSource[]
}

/** Reads the repository issue tree without interpreting historical prose. */
export const readBacklogSources = (repositoryRoot: string): BacklogSources => {
	const issuesRoot = path.join(repositoryRoot, 'issues')
	const issues: BacklogIssueSource[] = []
	const milestones: BacklogMilestoneSource[] = []

	const directories = fs
		.readdirSync(issuesRoot, { withFileTypes: true })
		.sort((left, right) => left.name.localeCompare(right.name))
	for (const directory of directories) {
		if (!directory.isDirectory()) continue
		const directoryMatch = /^(\d+)(?:-|$)/u.exec(directory.name)
		if (directoryMatch?.[1] === undefined) continue
		const milestoneId = Number(directoryMatch[1]) / 100
		if (!Number.isSafeInteger(milestoneId)) continue
		const directoryPath = path.join(issuesRoot, directory.name)
		const readmePath = path.join(directoryPath, 'README.md')
		if (fs.existsSync(readmePath)) {
			milestones.push({
				contents: fs.readFileSync(readmePath, 'utf8'),
				file: path.relative(repositoryRoot, readmePath),
				id: milestoneId,
			})
		}

		const entries = fs
			.readdirSync(directoryPath, { withFileTypes: true })
			.sort((left, right) => left.name.localeCompare(right.name))
		for (const entry of entries) {
			if (!entry.isFile()) continue
			const issueMatch = /^(\d+)-.+\.md$/u.exec(entry.name)
			if (issueMatch?.[1] === undefined) continue
			const issuePath = path.join(directoryPath, entry.name)
			issues.push({
				contents: fs.readFileSync(issuePath, 'utf8'),
				file: path.relative(repositoryRoot, issuePath),
				id: Number(issueMatch[1]),
			})
		}
	}

	return { issues, milestones }
}

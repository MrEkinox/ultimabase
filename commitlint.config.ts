// Commit messages follow Conventional Commits, scoped by the part of the
// repository they change (D-156): `fix(graphql): …`, `docs(website): …`.
import { readdirSync } from 'node:fs'

const packages = readdirSync('packages', { withFileTypes: true })
	.filter((entry) => entry.isDirectory())
	.map((entry) => entry.name)

export default {
	extends: ['@commitlint/config-conventional'],
	// Dependabot's commits quote release notes on lines of any length (D-194).
	ignores: [
		(message: string) => message.includes('Signed-off-by: dependabot[bot]'),
	],
	rules: {
		'scope-enum': [
			2,
			'always',
			[
				...packages,
				'bench',
				'ci',
				'docs',
				'examples',
				'release',
				'repo',
				'website',
			],
		],
	},
}

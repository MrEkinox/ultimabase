// Commit messages follow Conventional Commits, scoped by the part of the
// repository they change (D-156): `fix(graphql): …`, `docs(website): …`.
import { readdirSync } from 'node:fs'

const packages = readdirSync('packages', { withFileTypes: true })
	.filter((entry) => entry.isDirectory())
	.map((entry) => entry.name)

export default {
	extends: ['@commitlint/config-conventional'],
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

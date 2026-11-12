// npm trusts this workflow per package, and only for a package it has
// (D-156): a new package's first version is published by hand, then trusted,
// before a release publishes anything (D-367).

/** The commands that publish a new package's first version and trust CI. */
const firstPublish = (name: string): string =>
	[
		`  yarn workspace ${name} exec npm pkg set version=0.0.0-first.0`,
		`  yarn workspace ${name} pack --out /tmp/first.tgz`,
		`  git checkout -- packages`,
		`  npm publish /tmp/first.tgz --tag canary --access public`,
		`  npm trust github ${name} --file ci.yml --repo MrEkinox/ultimabase --env npm --allow-publish -y`,
	].join('\n')

/**
 * Throws, before anything is published, when npm has none of a package in
 * `names`; the message gives the commands for each.
 */
export const requireKnown = async (
	names: readonly string[],
	known: (name: string) => Promise<boolean>,
): Promise<void> => {
	const unknown: string[] = []
	for (const name of names) if (!(await known(name))) unknown.push(name)
	if (unknown.length === 0) return
	throw new Error(
		[
			`npm has no ${unknown.join(', ')}: nothing was published.`,
			'Publish each first version by hand and trust this workflow, then run again (D-367):',
			...unknown.map(firstPublish),
		].join('\n'),
	)
}

import { expect, it } from 'vitest'
import { requireKnown } from './npm-knows.ts'

const known = async (name: string) => name !== '@ultimabase/sentry'

it('names each package npm lacks, with the commands for its first version', async () => {
	// A new package stopped a canary halfway: the packages after it were left
	// on the previous canary.
	const names = ['@ultimabase/roles', '@ultimabase/sentry', 'ultimabase']
	await expect(requireKnown(names, known)).rejects.toThrow(
		new Error(
			[
				'npm has no @ultimabase/sentry: nothing was published.',
				'Publish each first version by hand and trust this workflow, then run again (D-367):',
				'  yarn workspace @ultimabase/sentry exec npm pkg set version=0.0.0-first.0',
				'  yarn workspace @ultimabase/sentry pack --out /tmp/first.tgz',
				'  git checkout -- packages',
				'  npm publish /tmp/first.tgz --tag canary --access public',
				'  npm trust github @ultimabase/sentry --file ci.yml --repo MrEkinox/ultimabase --env npm --allow-publish -y',
			].join('\n'),
		),
	)
})

it('passes when npm has every package', async () => {
	await expect(requireKnown(['ultimabase'], known)).resolves.toBeUndefined()
})

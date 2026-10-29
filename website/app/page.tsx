import { HomeLayout } from 'fumadocs-ui/layouts/home'
import Link from 'next/link'

import { shared } from '../lib/layout'

export default function Landing() {
	return (
		<HomeLayout {...shared}>
			<main className="mx-auto flex max-w-3xl flex-1 flex-col justify-center gap-4 px-4 py-16">
				<h1 className="text-4xl font-bold">UltimaBase</h1>
				<p className="text-fd-muted-foreground">
					A TypeScript backend built from a small kernel and its plugins.
				</p>
				<Link className="underline" href="/docs">
					Read the documentation
				</Link>
			</main>
		</HomeLayout>
	)
}

import Link from 'next/link'

import { siteConfig } from '../../lib/site'

export default function HomePage() {
	return (
		<main className="mx-auto flex min-h-[calc(100dvh-64px)] max-w-5xl flex-col justify-center px-6 py-20">
			<p className="mb-4 text-sm font-medium uppercase tracking-[0.16em]">
				{siteConfig.releaseStatus}
			</p>
			<h1 className="max-w-3xl text-5xl font-semibold tracking-tight sm:text-6xl">
				A typed backend foundation for explicit applications.
			</h1>
			<p className="mt-6 max-w-2xl text-lg text-fd-muted-foreground">
				The website foundation is ready. The complete product story and visual
				system follow in the next focused milestones.
			</p>
			<div className="mt-8">
				<Link className="font-medium underline underline-offset-4" href="/docs">
					Open documentation
				</Link>
			</div>
		</main>
	)
}

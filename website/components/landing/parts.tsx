// The landing page's building blocks (D-155), styled by `app/landing.css`.
import { Tab, Tabs } from 'fumadocs-ui/components/tabs'
import Link from 'next/link'
import type { ReactNode } from 'react'

type Children = { readonly children?: ReactNode }

/** A link inside the site, or to another one. */
export function To({
	href,
	className,
	children,
}: Children & { readonly href: string; readonly className?: string }) {
	return href.startsWith('/') ? (
		<Link className={className} href={href}>
			{children}
		</Link>
	) : (
		<a className={className} href={href}>
			{children}
		</a>
	)
}

/** A page of the documentation's next version. */
export const docs = (page: string): string => `/docs/next/${page}`

export function Arrow() {
	return (
		<svg
			aria-hidden="true"
			className="ub-arrow"
			fill="none"
			stroke="currentColor"
			strokeLinecap="round"
			strokeLinejoin="round"
			strokeWidth="1.5"
			viewBox="0 0 16 16"
		>
			<path d="M3 8h10M9 4l4 4-4 4" />
		</svg>
	)
}

export function Button({
	href,
	quiet = false,
	children,
}: Children & { readonly href: string; readonly quiet?: boolean }) {
	return (
		<To className={quiet ? 'ub-button ub-quiet' : 'ub-button'} href={href}>
			{children}
			<Arrow />
		</To>
	)
}

/** A section's label, title and paragraph; `split` sets them side by side. */
export function Heading({
	label,
	title,
	split = false,
	children,
}: Children & {
	readonly label: string
	readonly title: ReactNode
	readonly split?: boolean
}) {
	return (
		<div className={split ? 'ub-heading ub-split' : 'ub-heading'}>
			<div>
				<p className="ub-label">{label}</p>
				<h2>{title}</h2>
			</div>
			<p className="ub-intro">{children}</p>
		</div>
	)
}

export interface Pane {
	readonly name: string
	readonly code: ReactNode
	/** What the code does, beside it; without it, the code takes the width. */
	readonly result?: ReactNode
}

/** Code in tabs, each beside what it does; the tallest pane sets the height. */
export function Proof({
	panes,
	className = 'ub-proof',
	children,
}: Children & {
	readonly panes: readonly Pane[]
	readonly className?: string
}) {
	return (
		<figure className={className}>
			<Tabs className="ub-tabs" items={panes.map(({ name }) => name)}>
				{panes.map(({ name, code, result }) => (
					<Tab forceMount key={name} value={name}>
						<div className={result === undefined ? 'ub-pane-wide' : 'ub-pane'}>
							<div className="ub-pane-code">{code}</div>
							{result === undefined ? null : (
								<div className="ub-side">{result}</div>
							)}
						</div>
					</Tab>
				))}
			</Tabs>
			{children === undefined ? null : <figcaption>{children}</figcaption>}
		</figure>
	)
}

/** A result's eyebrow and title. */
export function Result({
	eyebrow,
	title,
	children,
}: Children & { readonly eyebrow: string; readonly title: ReactNode }) {
	return (
		<>
			<p className="ub-eyebrow">{eyebrow}</p>
			<h3 className="ub-result-title">{title}</h3>
			{children}
		</>
	)
}

/** A row a client asks for, and what happens to it. */
export function Row({
	name,
	value,
	off = false,
	children,
}: Children & {
	readonly name: ReactNode
	readonly value: ReactNode
	readonly off?: boolean
}) {
	return (
		<li className={off ? 'ub-row ub-row-off' : 'ub-row'}>
			<span className="ub-row-name">{name}</span>
			<code>{value}</code>
			<span className="ub-row-state">{children}</span>
		</li>
	)
}

export function Rows({ children }: Children) {
	return <ul className="ub-rows">{children}</ul>
}

/** Numbered steps, each a name and a sentence. */
export function Steps({
	steps,
}: {
	readonly steps: readonly (readonly [string, ReactNode])[]
}) {
	return (
		<ol className="ub-steps">
			{steps.map(([name, text], index) => (
				<li key={name}>
					<span className="ub-step-number">
						{String(index + 1).padStart(2, '0')}
					</span>
					<div>
						<p className="ub-step-name">{name}</p>
						<p className="ub-step-text">{text}</p>
					</div>
				</li>
			))}
		</ol>
	)
}

/** A titled panel of a capability, linking to its page. */
export function Panel({
	label,
	title,
	page,
	soft = false,
	children,
}: Children & {
	readonly label: string
	readonly title: string
	readonly page: string
	readonly soft?: boolean
}) {
	return (
		<article className={soft ? 'ub-panel ub-panel-soft' : 'ub-panel'}>
			<p className="ub-eyebrow">{label}</p>
			<h3>{title}</h3>
			{children}
			<To className="ub-more" href={docs(page)}>
				Read more
				<Arrow />
			</To>
		</article>
	)
}

export interface Entry {
	readonly name: string
	readonly page: string
	readonly text: ReactNode
}

/** Entries on hairlines, each linking to its page. */
export function Entries({
	entries,
	className = 'ub-entries',
}: {
	readonly entries: readonly Entry[]
	readonly className?: string
}) {
	return (
		<ul className={className}>
			{entries.map((entry) => (
				<li key={entry.name}>
					<To href={docs(entry.page)}>
						<code>{entry.name}</code>
						<span>{entry.text}</span>
						<Arrow />
					</To>
				</li>
			))}
		</ul>
	)
}

export function Question({
	title,
	children,
}: Children & { readonly title: string }) {
	return (
		<details>
			<summary>
				{title}
				<svg
					aria-hidden="true"
					fill="none"
					stroke="currentColor"
					strokeWidth="1.5"
					viewBox="0 0 16 16"
				>
					<path d="M4 6l4 4 4-4" />
				</svg>
			</summary>
			<p className="ub-answer">{children}</p>
		</details>
	)
}

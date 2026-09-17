import { ServerCodeBlock } from 'fumadocs-ui/components/codeblock.rsc'
import { ArrowDown, ArrowUpRight } from 'lucide-react'

import { currentDocumentationPath } from '../../lib/docs-versions'
import { Section, TextLink } from '../primitives'
import {
	dataCapabilities,
	virtualFieldExample,
	writeCapabilities,
} from './capability-content'

/** These previews explain documented behavior without simulating a database. */
export function DataCapabilities() {
	return (
		<Section
			className="ub-capabilities ub-data-capabilities"
			id="data-modeling"
			aria-labelledby="data-capabilities-title"
		>
			<header className="ub-capability-heading">
				<div>
					<p className="ub-section-index">05 / DATA MODELING</p>
					<h2 id="data-capabilities-title">More than columns.</h2>
				</div>
				<p>
					Model structured values and relationships. Compute the fields your API
					returns, with types that follow your selections.
				</p>
			</header>
			<div className="ub-computed-proof">
				<ServerCodeBlock
					code={virtualFieldExample}
					lang="ts"
					themes={{ light: 'github-light', dark: 'github-dark' }}
					codeblock={{ title: 'profile.ts', className: 'ub-capability-code' }}
				/>
				<div className="ub-computed-result">
					<p className="ub-demo-eyebrow">VIRTUAL FIELDS / CORE</p>
					<h3>Compute it. Don’t store it.</h3>
					<dl className="ub-computed-values">
						<div>
							<dt>firstName</dt>
							<dd>Ada</dd>
						</div>
						<div>
							<dt>lastName</dt>
							<dd>Lovelace</dd>
						</div>
					</dl>
					<ArrowDown aria-hidden="true" />
					<div className="ub-computed-output">
						<span>displayName</span>
						<strong>Ada Lovelace</strong>
					</div>
					<p>
						Select only <code>displayName</code> to return the computed value
						and <code>id</code>. Its stored dependencies stay out of the
						response.
					</p>
					<TextLink
						href={currentDocumentationPath('core/data-modeling/virtual-fields')}
					>
						Explore virtual fields <ArrowUpRight aria-hidden="true" />
					</TextLink>
				</div>
			</div>
			<div className="ub-capability-columns">
				{dataCapabilities.map((item) => (
					<article key={item.title}>
						<h3>{item.title}</h3>
						<p>{item.description}</p>
						{'code' in item && (
							<code className="ub-validation-rule">{item.code}</code>
						)}
						<TextLink href={currentDocumentationPath(item.href)}>
							{item.label} <ArrowUpRight aria-hidden="true" />
						</TextLink>
					</article>
				))}
			</div>
			<div className="ub-capability-columns ub-query-capabilities">
				<article>
					<h3>Query the data you need.</h3>
					<p>
						Select fields, include related models, filter and sort. Page with
						limit and offset; use count or exists when you don’t need the
						records.
					</p>
					<TextLink
						href={currentDocumentationPath('core/reading-data/overview')}
					>
						Explore queries <ArrowUpRight aria-hidden="true" />
					</TextLink>
				</article>
				<article>
					<h3>Build on a shared query.</h3>
					<p>
						Start with a base query and derive variants. Immutable builders keep
						the original unchanged, and returned models are immutable snapshots.
					</p>
					<TextLink
						href={currentDocumentationPath('core/reading-data/overview')}
					>
						Query builders and scopes <ArrowUpRight aria-hidden="true" />
					</TextLink>
				</article>
				<article>
					<h3>Filter related records.</h3>
					<p>
						Find authors with at least three published posts, or filter a
						relation for the current request. Use some, every, and count
						predicates. Access policies still enforce authorization.
					</p>
					<TextLink
						href={currentDocumentationPath('core/reading-data/related-data')}
					>
						Explore related data <ArrowUpRight aria-hidden="true" />
					</TextLink>
				</article>
			</div>
		</Section>
	)
}

export function WriteCapabilities() {
	return (
		<div
			className="ub-capability-columns ub-write-capabilities"
			aria-label="More data operations"
		>
			{writeCapabilities.map((item) => (
				<article key={item.title}>
					<code className="ub-operation-label">{item.label}</code>
					<h3>{item.title}</h3>
					<p>{item.description}</p>
					<TextLink href={currentDocumentationPath(item.href)}>
						Explore {item.title.toLowerCase()}{' '}
						<ArrowUpRight aria-hidden="true" />
					</TextLink>
				</article>
			))}
		</div>
	)
}

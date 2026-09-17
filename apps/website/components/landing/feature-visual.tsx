import { ArrowRight, Check, GitBranch, ShieldCheck } from 'lucide-react'

interface FeatureVisualProps {
	readonly kind: 'transaction' | 'relation' | 'security' | 'types'
}

/** Illustrative diagrams describe contracts, not live database activity. */
export function FeatureVisual({ kind }: FeatureVisualProps) {
	if (kind === 'transaction')
		return (
			<div
				className="ub-feature-visual ub-visual-transaction"
				role="img"
				aria-label="One transaction contains the mutation and its hook-started writes, followed by one commit."
			>
				<div className="ub-transaction" aria-hidden="true">
					<div>
						<span>01</span>
						<code>Create Article</code>
						<Check />
					</div>
					<div>
						<span>02</span>
						<code>Run hook-started writes</code>
						<Check />
					</div>
					<div className="ub-transaction-commit">
						<span>↳</span>
						<strong>Commit together</strong>
						<Check />
					</div>
				</div>
			</div>
		)
	if (kind === 'relation')
		return (
			<div
				className="ub-feature-visual ub-visual-relation"
				role="img"
				aria-label="An Author can be linked to multiple Articles through a relation."
			>
				<div className="ub-relation-model" aria-hidden="true">
					<strong>Author</strong>
					<span>id</span>
					<span>name</span>
				</div>
				<div className="ub-relation-edge" aria-hidden="true">
					<span>1 : n</span>
					<GitBranch />
				</div>
				<div className="ub-relation-model" aria-hidden="true">
					<strong>Article[]</strong>
					<span>title</span>
					<span>author</span>
				</div>
			</div>
		)
	if (kind === 'security')
		return (
			<div
				className="ub-feature-visual ub-visual-security"
				role="img"
				aria-label="Identifying a caller does not grant access. Installed policies determine permissions."
			>
				<div className="ub-policy-example" aria-hidden="true">
					<ShieldCheck />
					<div>
						<span>Authentication</span>
						<strong>Who is calling?</strong>
					</div>
					<ArrowRight />
					<div>
						<span>Access / ACL</span>
						<strong>What is allowed?</strong>
					</div>
				</div>
			</div>
		)
	return (
		<div
			className="ub-feature-visual ub-visual-types"
			role="img"
			aria-label="With generated declarations, selecting title yields a model with id and a string title."
		>
			<div className="ub-type-example" aria-hidden="true">
				<code>select: {'{ title: true }'}</code>
				<ArrowRight />
				<div>
					<span>Selected model</span>
					<code>
						id: string
						<br />
						title: string
					</code>
				</div>
			</div>
		</div>
	)
}

/** A product-specific, readable view of what one configured application exposes. */
export function ApplicationProof() {
	return (
		<figure
			className="ub-proof"
			aria-labelledby="ub-proof-caption"
			data-testid="visual-system-motion"
		>
			<div className="ub-proof-toolbar">
				<span>SCHEMA + PLUGINS</span>
				<span className="ub-proof-live">ONE APPLICATION</span>
			</div>
			<div className="ub-proof-body">
				<div className="ub-proof-inputs">
					<div className="ub-proof-schema">
						<p>01 / DECLARE</p>
						<strong>Article</strong>
						<dl>
							<div>
								<dt>slug</dt>
								<dd>unique string</dd>
							</div>
							<div>
								<dt>title</dt>
								<dd>required string</dd>
							</div>
						</dl>
					</div>
					<div className="ub-proof-plugins">
						<p>02 / ADD PLUGINS</p>
						<ul>
							<li>
								PostgreSQL <span>persistence</span>
							</li>
							<li>
								Typegen <span>declarations</span>
							</li>
						</ul>
					</div>
				</div>
				<div className="ub-proof-connector" aria-hidden="true">
					<span />
					<b>→</b>
				</div>
				<div className="ub-proof-output">
					<p>03 / USE</p>
					<strong>One application</strong>
					<ul>
						<li>
							<code>Article.findMany</code>
							<span>Typed read</span>
						</li>
						<li>
							<code>Article.createOne</code>
							<span>Transactional write</span>
						</li>
						<li>
							<code>.d.ts</code>
							<span>Replaceable types</span>
						</li>
					</ul>
				</div>
			</div>
			<figcaption id="ub-proof-caption">
				This example shows direct TypeScript calls. REST and GraphQL are
				optional plugins.
			</figcaption>
		</figure>
	)
}

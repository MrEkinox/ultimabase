// The logo: two rings, three satellites and a center in the accent. The
// rings and satellites take the text's color; each satellite's outline takes
// the page's, so it cuts the ring it sits on.

/** The mark alone, sized by its font size. */
export function Mark({ className }: { readonly className?: string }) {
	return (
		<svg
			aria-hidden="true"
			className={className}
			fill="none"
			height="1em"
			viewBox="0 0 64 64"
			width="1em"
		>
			<g stroke="currentColor" strokeWidth="2.25">
				<circle cx="32" cy="32" r="13" />
				<circle cx="32" cy="32" r="24" />
			</g>
			<g
				fill="currentColor"
				stroke="var(--color-fd-background)"
				strokeWidth="3.25"
			>
				<circle cx="22.81" cy="22.81" r="3.25" />
				<circle cx="52.78" cy="20" r="4.25" />
				<circle cx="20" cy="52.78" r="3.5" />
			</g>
			<circle cx="32" cy="32" fill="var(--ub-accent)" r="7" />
		</svg>
	)
}

/** The mark and the name, as the navigation shows them. */
export function Logo() {
	return (
		<span className="ub-logo">
			<Mark />
			UltimaBase
		</span>
	)
}

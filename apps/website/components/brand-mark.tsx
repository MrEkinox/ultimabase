export interface BrandMarkProps {
	readonly className?: string
	readonly size?: number
}

/** The provisional mark is intentionally geometric and replaceable here. */
export function BrandMark({ className, size = 24 }: BrandMarkProps) {
	return (
		<svg
			aria-hidden="true"
			className={className}
			fill="none"
			height={size}
			viewBox="0 0 24 24"
			width={size}
		>
			<rect
				height="17"
				rx="4"
				stroke="currentColor"
				width="17"
				x="3.5"
				y="3.5"
			/>
			<path d="M9 7.5v9M9 12h7.5" stroke="currentColor" strokeLinecap="round" />
			<circle cx="16.5" cy="7.5" fill="currentColor" r="1.5" />
		</svg>
	)
}

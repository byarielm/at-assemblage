/**
 * Placeholder wordmark: the favicon's three linked nodes plus the name.
 * Swap this file for the real logo; it only needs to render at ~28px tall.
 */
export function Logo({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 168 32"
      height="28"
      role="img"
      aria-label="Assemblage"
      className={`text-ink ${className}`}
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="32" height="32" rx="7" fill="#1f2937" />
      <path d="M12 12l3 8M20 12l-3 8M13 10h6" stroke="#e5e7eb" strokeWidth="1.6" />
      <circle cx="9" cy="10" r="4" fill="#60a5fa" />
      <circle cx="23" cy="10" r="4" fill="#f59e0b" />
      <circle cx="16" cy="23" r="4" fill="#34d399" />
      <text
        x="42"
        y="22"
        fill="currentColor"
        fontFamily="Inter, ui-sans-serif, system-ui, sans-serif"
        fontSize="17"
        fontWeight="650"
        letterSpacing="-0.2"
      >
        Assemblage
      </text>
    </svg>
  )
}

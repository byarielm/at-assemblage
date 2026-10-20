/**
 * Wordmark: swaps between the light and dark SVGs with the OS colour scheme
 * and scales to fill its container while keeping its aspect ratio.
 */
export function Logo({ className = '' }: { className?: string }) {
  return (
    <picture className={`block h-full w-full ${className}`}>
      <source srcSet="/logo-dark.svg" media="(prefers-color-scheme: dark)" />
      <img
        src="/logo-light.svg"
        alt="Assemblage"
        className="h-full w-full object-contain object-left"
        draggable={false}
      />
    </picture>
  )
}

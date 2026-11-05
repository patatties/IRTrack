/** The IRTrack mark: a siren (incident, action needed) on a brand-color tile. Same drawing as public/favicon.svg. */
export function AppLogo({
  className = "size-8",
  title = "IRTrack",
}: {
  className?: string;
  title?: string;
}) {
  return (
    <svg viewBox="0 0 32 32" className={className} role="img" aria-label={title}>
      <rect width="32" height="32" rx="7" fill="#1f5f5b" />
      <path
        d="M16 3.5v3.5M7.2 7.6l2.4 2.4M24.8 7.6l-2.4 2.4"
        stroke="#ffffff"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path d="M9.5 22v-5.5a6.5 6.5 0 0 1 13 0V22Z" fill="#ef5b3f" />
      <path
        d="M13.2 16.4a3 3 0 0 1 2.6-2.6"
        stroke="#ffffff"
        strokeOpacity=".75"
        strokeWidth="1.6"
        strokeLinecap="round"
        fill="none"
      />
      <rect x="6.5" y="22" width="19" height="4.5" rx="1.6" fill="#ffffff" />
    </svg>
  );
}

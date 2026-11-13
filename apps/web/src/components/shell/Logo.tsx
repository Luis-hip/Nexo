export function Logo({ soloIcono }: { soloIcono?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2" data-cmp="cmp/identidad/logo">
      <svg width="32" height="32" viewBox="0 0 32 32" aria-hidden className="shrink-0">
        <rect width="32" height="32" rx="9" fill="var(--brand-primary)" />
        <path
          d="M6 22c3.5 0 4.5-12 10-12s6.5 12 10 12"
          fill="none"
          stroke="var(--brand-on-primary)"
          strokeWidth="2.6"
          strokeLinecap="round"
        />
        <circle cx="16" cy="10" r="2.6" fill="var(--brand-on-primary)" />
      </svg>
      {!soloIcono && <span className="text-lg font-semibold tracking-tight">Nexo</span>}
    </span>
  );
}

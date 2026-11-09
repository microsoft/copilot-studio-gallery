export function Monster({ className = "" }: { className?: string }) {
  return <svg className={className} viewBox="0 0 220 220" fill="none" aria-hidden="true">
    <ellipse cx="111" cy="201" rx="65" ry="7" fill="#62557d" opacity=".1" />
    <g stroke="#65567c" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M68 168c-7 12-12 26-4 29 10 4 22-9 24-19m42 0c1 16 15 24 22 18 6-5-2-18-8-25" fill="#a69bc5" />
      <path d="M55 114c-15-1-25 12-21 22 4 9 13 2 22-5m108-28c14-1 16-17 19-22 3-4 8-2 8 4 0 18-10 36-25 40" fill="#b9add8" />
      <path d="M67 66C44 55 42 29 54 21c8-5 10 16 30 25m45 2c13-23 32-29 37-22 6 8-12 16-14 35" fill="#b9add8" />
      <path d="M107 43c38-3 50 21 55 45 4 19 17 38 11 62-6 27-30 37-64 36-38 0-64-10-66-38-2-22 11-42 14-59 5-28 18-44 50-46Z" fill="#b9add8" />
      <path d="M65 73c6-11 15-17 25-18" stroke="#d8cfee" strokeWidth="6" />
      <path d="M78 157c0-18 15-27 32-26 20 1 32 11 31 29-20 12-43 13-63-3Z" fill="#d4c9e8" stroke="none" />
      <ellipse cx="85" cy="97" rx="19" ry="23" fill="#fffdf3" transform="rotate(-8 85 97)" />
      <ellipse cx="130" cy="94" rx="16" ry="19" fill="#fffdf3" transform="rotate(10 130 94)" />
      <path className="monster-pupil" d="M91 96v5m42-10v5" stroke="#4b405e" strokeWidth="8" />
      <ellipse cx="65" cy="121" rx="10" ry="5" fill="#eab6b0" stroke="none" />
      <ellipse cx="148" cy="117" rx="9" ry="5" fill="#eab6b0" stroke="none" />
      <path d="M94 122q14 16 28-3" stroke="#4b405e" />
      <path d="m107 130 3 8 6-9" fill="#fffdf3" stroke="#4b405e" strokeWidth="2" />
      <path d="m58 145 2 2m4 10 2 1m87-22 2 1" stroke="#9e90bb" />
    </g>
    <path d="m187 40 4-10 4 10 10 4-10 4-4 10-4-10-10-4Z" fill="#d8b576" />
    <path d="m26 78 2-7 3 7 7 3-7 2-3 7-2-7-7-2Z" fill="#96b49a" />
  </svg>;
}

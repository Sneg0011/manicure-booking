import Link from 'next/link';

export function Pill({
  href,
  children,
  rose = false,
}: {
  href: string;
  children: React.ReactNode;
  rose?: boolean;
}) {
  return (
    <Link className={`pill${rose ? ' pill-rose' : ''}`} href={href}>
      <span className="pill-arrow" aria-hidden="true">
        ↗
      </span>
      {children}
    </Link>
  );
}

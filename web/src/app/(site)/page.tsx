import Link from 'next/link';
import { Logo } from '@/components/brand/Logo';

export default function Landing() {
  return (
    <main className="grid-glow flex min-h-dvh flex-col items-center justify-center gap-6">
      <Logo size="lg" />
      <Link href="/portal" className="text-brand-bright">Sign in</Link>
    </main>
  );
}

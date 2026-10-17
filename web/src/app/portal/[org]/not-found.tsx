import { EmptyState } from '@/components/ui/States';
import { ButtonLink } from '@/components/ui/Button';

export default function NotFound() {
  return (
    <div className="mx-auto max-w-2xl py-10">
      <EmptyState
        title="Not found"
        body="This organisation or record doesn't exist, or you don't have access to it."
        action={<ButtonLink href="/portal">My organisations</ButtonLink>}
      />
    </div>
  );
}

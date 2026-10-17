'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { MessageSquarePlus } from 'lucide-react';
import type { HistoryEntity } from '@/lib/domain/types';
import { addHistoryNote } from '@/lib/portal/actions/history';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Field';

export function AddNoteForm({
  orgKey,
  entity,
  id,
}: {
  orgKey: string;
  entity: HistoryEntity;
  id: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!open) {
    return (
      <Button size="sm" onClick={() => setOpen(true)} data-testid="add-note">
        <MessageSquarePlus className="h-4 w-4" /> Add note
      </Button>
    );
  }

  const save = () =>
    start(async () => {
      setError(null);
      const result = await addHistoryNote(orgKey, entity, id, note);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success('Note added');
      setNote('');
      setOpen(false);
      router.refresh();
    });

  return (
    <form
      className="w-full space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <label htmlFor={`note-${id}`} className="text-body text-sm font-medium">
        Note
      </label>
      <Textarea
        id={`note-${id}`}
        rows={3}
        maxLength={2500}
        autoFocus
        value={note}
        onChange={(e) => setNote(e.target.value)}
        data-testid="note-text"
      />
      {error && (
        <p role="alert" className="text-danger text-sm">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
          disabled={pending}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          variant="primary"
          size="sm"
          disabled={pending || !note.trim()}
          data-testid="save-note"
        >
          {pending ? 'Saving…' : 'Save note'}
        </Button>
      </div>
    </form>
  );
}

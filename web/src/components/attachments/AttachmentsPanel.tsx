'use client';

import { useRouter } from 'next/navigation';
import { useId, useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Download, Eye, FileImage, FileText, Loader2, Paperclip, Upload } from 'lucide-react';
import type { Attachment, AttachmentEntity } from '@/lib/domain/types';
import { uploadAttachment } from '@/lib/portal/actions/attachments';
import {
  attachmentUrl,
  formatFileSize,
  previewKind,
  UPLOAD_ACCEPT,
  validateUpload,
} from '@/lib/attachments';
import { formatDate } from '@/lib/ui/format';
import { cn } from '@/lib/ui/cn';
import { buttonClass } from '@/components/ui/Button';
import { FilePreview } from './FilePreview';

export function AttachmentsPanel({
  orgKey,
  entity,
  documentId,
  attachments,
  canUpload,
  sourceName,
  maxFiles,
}: {
  orgKey: string;
  entity: AttachmentEntity;
  documentId: string;
  attachments: Attachment[];
  canUpload: boolean;
  /** "Xero", "Business Central"... for "not available from" notes. */
  sourceName: string;
  maxFiles?: number;
}) {
  const router = useRouter();
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const firstPreviewable = attachments.find((a) => previewKind(a.contentType));
  const [selected, setSelected] = useState<string | undefined>(firstPreviewable?.id);
  const current = attachments.find((a) => a.id === selected);
  const full = maxFiles !== undefined && attachments.length >= maxFiles;

  const upload = (files: FileList | File[]) => {
    const list = Array.from(files);
    if (list.length === 0) return;
    setError(null);
    const problems = list.map(validateUpload).filter(Boolean) as string[];
    if (problems.length) return setError(problems.join(' '));
    if (maxFiles !== undefined && attachments.length + list.length > maxFiles)
      return setError(`A document can have up to ${maxFiles} files.`);
    start(async () => {
      for (const file of list) {
        const form = new FormData();
        form.set('file', file);
        const result = await uploadAttachment(orgKey, entity, documentId, form);
        if (!result.ok) {
          setError(result.error);
          toast.error(result.error);
          return;
        }
        toast.success(`Attached ${result.data.fileName}`);
        setSelected(result.data.id);
      }
      if (input.current) input.current.value = '';
      router.refresh();
    });
  };

  return (
    <section className="card" aria-labelledby={`${inputId}-title`}>
      <div className="border-line flex items-center justify-between gap-3 border-b px-5 py-4">
        <h2
          id={`${inputId}-title`}
          className="text-ink flex items-center gap-2 text-[15px] font-semibold"
        >
          <Paperclip className="text-muted h-4 w-4" aria-hidden />
          Attachments
          <span className="text-muted text-sm font-normal">({attachments.length})</span>
        </h2>
      </div>

      <div className="space-y-4 p-5">
        {attachments.length === 0 ? (
          <p className="text-muted text-sm">No files attached yet.</p>
        ) : (
          <ul className="divide-line border-line divide-y rounded-lg border" aria-label="Files">
            {attachments.map((a) => {
              const kind = previewKind(a.contentType);
              const Icon = kind === 'image' ? FileImage : FileText;
              const size = formatFileSize(a.size);
              const isCurrent = a.id === selected;
              return (
                <li
                  key={a.id}
                  className={cn(
                    'flex flex-wrap items-center gap-3 px-3 py-2.5 text-sm',
                    isCurrent && 'bg-surface-2'
                  )}
                >
                  <Icon className="text-muted h-5 w-5 shrink-0" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="text-ink truncate font-medium" title={a.fileName}>
                      {a.fileName}
                    </p>
                    <p className="text-muted text-xs">
                      {size ?? `Size not available from ${sourceName}`}
                      {a.updatedAt ? ` · ${formatDate(a.updatedAt)}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    {kind && (
                      <button
                        type="button"
                        onClick={() => setSelected(isCurrent ? undefined : a.id)}
                        aria-pressed={isCurrent}
                        className={buttonClass('ghost', 'sm')}
                      >
                        <Eye className="h-3.5 w-3.5" /> {isCurrent ? 'Hide' : 'Preview'}
                      </button>
                    )}
                    <a
                      href={attachmentUrl(orgKey, entity, documentId, a.id, true)}
                      download={a.fileName}
                      className={buttonClass('ghost', 'sm')}
                      aria-label={`Download ${a.fileName}`}
                    >
                      <Download className="h-3.5 w-3.5" /> Download
                    </a>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {current && (
          <FilePreview
            key={current.id}
            src={attachmentUrl(orgKey, entity, documentId, current.id)}
            fileName={current.fileName}
            contentType={current.contentType}
          />
        )}

        {canUpload && !full && (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              upload(e.dataTransfer.files);
            }}
            className={cn(
              'flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-6 text-center text-sm transition-colors',
              dragging ? 'border-brand bg-brand/5' : 'border-line-strong'
            )}
            data-testid="attachment-dropzone"
          >
            {pending ? (
              <Loader2 className="text-brand h-5 w-5 animate-spin" aria-hidden />
            ) : (
              <Upload className="text-muted h-5 w-5" aria-hidden />
            )}
            <p className="text-body">
              {pending ? (
                'Uploading…'
              ) : (
                <>
                  Drag files here or{' '}
                  <label
                    htmlFor={inputId}
                    className="text-brand hover:text-brand-bright cursor-pointer font-medium underline-offset-2 hover:underline"
                  >
                    browse
                  </label>
                </>
              )}
            </p>
            <p className="text-muted text-xs">PDF, PNG or JPG, up to 10 MB each</p>
            <input
              ref={input}
              id={inputId}
              type="file"
              accept={UPLOAD_ACCEPT}
              multiple
              disabled={pending}
              className="sr-only"
              aria-label="Attach files"
              onChange={(e) => e.target.files && upload(e.target.files)}
            />
          </div>
        )}
        {canUpload && full && (
          <p className="text-muted text-sm">
            This document has the most files {sourceName} allows ({maxFiles}).
          </p>
        )}
        {error && (
          <p role="alert" className="text-danger text-sm">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}

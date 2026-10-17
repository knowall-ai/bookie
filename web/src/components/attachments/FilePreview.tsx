import { FileText } from 'lucide-react';
import { previewKind } from '@/lib/attachments';
import { cn } from '@/lib/ui/cn';

/** Inline preview of a PDF (iframe) or image, served through the authenticated proxy. */
export function FilePreview({
  src,
  fileName,
  contentType,
  className,
}: {
  src: string;
  fileName: string;
  contentType?: string;
  className?: string;
}) {
  const kind = previewKind(contentType);
  if (kind === 'pdf')
    return (
      <iframe
        src={src}
        title={`Preview of ${fileName}`}
        className={cn('border-line h-[560px] w-full rounded-lg border bg-white', className)}
      />
    );
  if (kind === 'image')
    return (
      // eslint-disable-next-line @next/next/no-img-element -- authenticated proxy, not a static asset
      <img
        src={src}
        alt={`Preview of ${fileName}`}
        className={cn(
          'border-line bg-surface-2 mx-auto max-h-[560px] w-auto max-w-full rounded-lg border object-contain',
          className
        )}
      />
    );
  return (
    <div
      className={cn(
        'border-line text-muted flex h-40 flex-col items-center justify-center gap-2 rounded-lg border border-dashed text-sm',
        className
      )}
    >
      <FileText className="h-6 w-6" />
      No preview for this file type. Download it to open it.
    </div>
  );
}

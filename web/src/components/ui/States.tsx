import { AlertTriangle, Inbox } from 'lucide-react';

export function EmptyState({
  title,
  body,
  action,
  icon,
}: {
  title: string;
  body?: React.ReactNode;
  action?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="card flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="bg-surface-2 text-muted mb-4 flex h-12 w-12 items-center justify-center rounded-full">
        {icon ?? <Inbox className="h-6 w-6" />}
      </div>
      <h3 className="text-ink font-semibold">{title}</h3>
      {body && <p className="text-muted mt-1 max-w-md text-sm">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorPanel({ title = 'Something went wrong', message, action }: { title?: string; message: string; action?: React.ReactNode }) {
  return (
    <div role="alert" className="card border-danger/30 flex items-start gap-3 px-5 py-4">
      <AlertTriangle className="text-danger mt-0.5 h-5 w-5 shrink-0" />
      <div className="min-w-0">
        <p className="text-ink font-semibold">{title}</p>
        <p className="text-muted mt-0.5 text-sm break-words">{message}</p>
        {action && <div className="mt-3">{action}</div>}
      </div>
    </div>
  );
}

/** Shown when a back end has no equivalent of a feature (e.g. payroll in BC). */
export function NotAvailable({ feature, source }: { feature: string; source: string }) {
  return (
    <EmptyState
      title={`${feature} isn't available for this organisation`}
      body={`${source} doesn't expose ${feature.toLowerCase()} through its API, so Bookie can't show it here. Switch organisation or open it in ${source} directly.`}
    />
  );
}

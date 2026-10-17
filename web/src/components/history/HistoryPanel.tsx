import { Suspense } from 'react';
import { History, Info } from 'lucide-react';
import type { AccountingConnector } from '@/lib/connectors/types';
import type { HistoryEntity, HistoryResult } from '@/lib/domain/types';
import { describeError } from '@/lib/portal/actions/util';
import { ErrorPanel } from '@/components/ui/States';
import { LocalTime } from './LocalTime';
import { AddNoteForm } from './AddNoteForm';

/**
 * Xero's "History and notes" block at the foot of a document or contact page.
 * Streams in after the page so a slow history call never holds the document up.
 */
export function HistoryPanel(props: {
  connector: AccountingConnector;
  orgKey: string;
  entity: HistoryEntity;
  id: string;
  source: string;
}) {
  if (!props.connector.history) return null;
  return (
    <section aria-labelledby="history-heading" className="card" data-testid="history-panel">
      <div className="border-line flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
        <h2
          id="history-heading"
          className="text-ink flex items-center gap-2 text-[15px] font-semibold"
        >
          <History className="text-faint h-4 w-4" /> History and notes
        </h2>
        {props.connector.history.addNote && (
          <AddNoteForm orgKey={props.orgKey} entity={props.entity} id={props.id} />
        )}
      </div>
      <Suspense
        fallback={
          <p className="text-muted px-5 py-6 text-sm" aria-busy="true">
            Loading history…
          </p>
        }
      >
        <HistoryRecords {...props} />
      </Suspense>
    </section>
  );
}

async function HistoryRecords({
  connector,
  entity,
  id,
  source,
}: {
  connector: AccountingConnector;
  entity: HistoryEntity;
  id: string;
  source: string;
}) {
  let result: HistoryResult;
  try {
    result = await connector.history!.list(entity, id);
  } catch (error) {
    return (
      <div className="p-5">
        <ErrorPanel title="Couldn't load the history" message={describeError(error)} />
      </div>
    );
  }
  return (
    <>
      {result.note && (
        <p className="text-muted border-line flex items-start gap-2 border-b px-5 py-3 text-sm">
          <Info className="text-faint mt-0.5 h-4 w-4 shrink-0" />
          {result.note}
        </p>
      )}
      {result.records.length === 0 ? (
        <p className="text-muted px-5 py-6 text-sm">
          {result.complete ? 'No history yet.' : `${source} returned no history for this record.`}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="sr-only sm:not-sr-only">
              <tr className="border-line text-muted border-b text-left text-xs font-semibold tracking-wide uppercase">
                <th className="px-5 py-2.5">Changes</th>
                <th className="px-5 py-2.5">Date</th>
                <th className="px-5 py-2.5">User</th>
                <th className="px-5 py-2.5">Details</th>
              </tr>
            </thead>
            <tbody>
              {result.records.map((r, i) => (
                <tr
                  key={`${r.date}-${i}`}
                  className="border-line/70 flex flex-col gap-0.5 border-b px-5 py-3 last:border-0 sm:table-row sm:p-0"
                  data-testid="history-record"
                >
                  <td className="text-ink font-medium sm:px-5 sm:py-3 sm:whitespace-nowrap">
                    {r.change}
                  </td>
                  <td className="text-muted sm:px-5 sm:py-3 sm:whitespace-nowrap">
                    <LocalTime iso={r.date} />
                  </td>
                  <td className="text-muted sm:px-5 sm:py-3 sm:whitespace-nowrap">
                    {r.user ?? ''}
                  </td>
                  <td className="text-body sm:px-5 sm:py-3">{r.details ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

'use client';

import { Download, Printer } from 'lucide-react';
import type { Report } from '@/lib/domain/types';
import { reportFileName, reportToCsv } from '@/lib/reports/format';
import { Button } from '@/components/ui/Button';

/** Export CSV (built in the browser from the report already on screen) and Print. */
export function ReportActions({ report, fileParts }: { report: Report; fileParts: string[] }) {
  const exportCsv = () => {
    // A BOM so Excel opens UTF-8 (en dashes, £) correctly.
    const blob = new Blob(['﻿', reportToCsv(report)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = reportFileName(report, fileParts);
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <div className="no-print flex items-center gap-2">
      <Button variant="secondary" size="sm" onClick={exportCsv}>
        <Download className="h-4 w-4" aria-hidden /> Export CSV
      </Button>
      <Button variant="secondary" size="sm" onClick={() => window.print()}>
        <Printer className="h-4 w-4" aria-hidden /> Print
      </Button>
    </div>
  );
}

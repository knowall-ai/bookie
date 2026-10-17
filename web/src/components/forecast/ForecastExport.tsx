'use client';

import { Download } from 'lucide-react';
import { forecastToCsv } from '@/lib/forecast/csv';
import type { Forecast } from '@/lib/forecast/types';
import { Button } from '@/components/ui/Button';

/** Export CSV, built in the browser from the forecast on screen. */
export function ForecastExport({ forecast, orgName }: { forecast: Forecast; orgName: string }) {
  const exportCsv = () => {
    const blob = new Blob(['﻿', forecastToCsv(forecast, 'Projected')], {
      type: 'text/csv;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const slug = orgName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    link.download = `cash-flow-forecast-${slug}-${forecast.currency}-${forecast.horizon}-${forecast.today}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <Button variant="secondary" size="sm" onClick={exportCsv} className="no-print">
      <Download className="h-4 w-4" aria-hidden /> Export CSV
    </Button>
  );
}

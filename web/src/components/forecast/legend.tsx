import type { Forecast, ForecastLayer } from '@/lib/forecast/types';
import { cn } from '@/lib/ui/cn';

/** Money in and out: the validated categorical pair shared with the home chart. */
export const FLOW = {
  in: { label: 'Money in', colour: '#3987e5' },
  out: { label: 'Money out', colour: '#d95926' },
} as const;

/** The running balance: neutral ink, so it never borrows a flow's identity. */
export const BALANCE_COLOUR = '#e2e8f0';

export const LAYER_NAMES: Record<ForecastLayer, string> = {
  known: 'Known',
  draft: 'Drafts and awaiting approval',
  planned: 'Planned (you entered this)',
  projected: 'Projection',
};

/** A small swatch drawn the way the chart draws the layer: solid, translucent, outlined or hatched. */
export function LayerSwatch({
  layer,
  direction = 'in',
  className,
}: {
  layer: ForecastLayer;
  direction?: 'in' | 'out';
  className?: string;
}) {
  const colour = FLOW[direction].colour;
  const style: React.CSSProperties =
    layer === 'known'
      ? { background: colour }
      : layer === 'draft'
        ? { background: colour, opacity: 0.42 }
        : layer === 'planned'
          ? { background: `${colour}24`, boxShadow: `inset 0 0 0 1.5px ${colour}` }
          : {
              backgroundImage: `repeating-linear-gradient(45deg, ${colour} 0 2px, ${colour}1f 2px 5px)`,
            };
  return (
    <span
      aria-hidden
      className={cn('inline-block h-2.5 w-2.5 shrink-0 rounded-sm', className)}
      style={style}
    />
  );
}

/** Legend under the chart: one entry per layer that is on, plus the balance line and lowest point. */
export function ForecastLegend({ forecast }: { forecast: Forecast }) {
  const layers: ForecastLayer[] = [
    'known',
    ...(forecast.layers.drafts ? (['draft'] as const) : []),
    'planned',
    ...(forecast.layers.projected ? (['projected'] as const) : []),
  ];
  return (
    <ul
      className="text-muted flex flex-wrap items-center gap-x-5 gap-y-2 text-xs"
      aria-label="Legend"
    >
      {(['in', 'out'] as const).map((d) => (
        <li key={d} className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="h-2.5 w-2.5 rounded-sm"
            style={{ background: FLOW[d].colour }}
          />
          {FLOW[d].label}
        </li>
      ))}
      <li aria-hidden className="bg-line h-3 w-px" />
      {layers.map((layer) => (
        <li key={layer} className="flex items-center gap-1.5">
          <span className="flex gap-0.5">
            <LayerSwatch layer={layer} direction="in" />
            <LayerSwatch layer={layer} direction="out" />
          </span>
          {layer === 'projected' && forecast.projection
            ? forecast.projection.label
            : LAYER_NAMES[layer]}
        </li>
      ))}
      {forecast.opening.balance !== undefined && (
        <>
          <li aria-hidden className="bg-line h-3 w-px" />
          <li className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="h-0.5 w-4 rounded-full"
              style={{ background: BALANCE_COLOUR }}
            />
            Running balance
          </li>
          {forecast.lowest && (
            <li className="flex items-center gap-1.5">
              <span
                aria-hidden
                className={cn(
                  'h-2.5 w-2.5 rounded-full',
                  forecast.lowest.belowZero ? 'bg-danger' : 'bg-warn'
                )}
              />
              Lowest point
            </li>
          )}
        </>
      )}
    </ul>
  );
}

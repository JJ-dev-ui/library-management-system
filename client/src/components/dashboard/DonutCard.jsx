import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import Skeleton from 'react-loading-skeleton';
import { PieChart as PieIcon } from 'lucide-react';
import EmptyState from '../EmptyState';
import useThemeColors from '../../hooks/useThemeColors';

// Donut chart + a legend with Bootstrap progress bars.
// items: [{ key, label, value, color }]. The legend repeats every label, number and percentage,
// so the chart never relies on colour alone (accessibility).
export default function DonutCard({ items, totalLabel, ariaLabel, loading, emptyText }) {
  const { font } = useThemeColors();
  if (loading) {
    return (
      <div aria-hidden="true">
        <div className="d-flex justify-content-center mb-3"><Skeleton circle width={170} height={170} /></div>
        <Skeleton count={4} height={18} className="mb-2" />
      </div>
    );
  }
  const total = items.reduce((s, x) => s + x.value, 0);
  if (total === 0) return <EmptyState icon={PieIcon} title="Nothing to show yet" text={emptyText} />;
  const pct = (v) => Math.round((v / total) * 100);

  return (
    <>
      <div className="donut-wrap" role="img" aria-label={`${ariaLabel}: ${items.map((x) => `${x.label} ${x.value}`).join(', ')}.`}>
        <ResponsiveContainer width="100%" height={190}>
          <PieChart>
            <Pie data={items} dataKey="value" nameKey="label" innerRadius={62} outerRadius={88} paddingAngle={2} stroke="none" isAnimationActive={false}>
              {items.map((x) => <Cell key={x.key} fill={x.color} />)}
            </Pie>
            <Tooltip formatter={(v, name) => [`${v} (${pct(v)}%)`, name]} contentStyle={{ borderRadius: 8, fontSize: 13, fontFamily: font }} />
          </PieChart>
        </ResponsiveContainer>
        {/* Total in the middle of the donut */}
        <div className="donut-center" aria-hidden="true">
          <div className="donut-total">{total}</div>
          <div className="meta small">{totalLabel}</div>
        </div>
      </div>
      <ul className="donut-legend">
        {items.map((x) => (
          <li key={x.key}>
            <div className="d-flex justify-content-between align-items-center gap-2 small">
              <span className="d-inline-flex align-items-center gap-2 min-w-0">
                <span className="legend-dot" style={{ background: x.color }} aria-hidden="true" />
                <span className="text-truncate">{x.label}</span>
              </span>
              <span className="text-nowrap"><strong>{x.value}</strong> <span className="meta">· {pct(x.value)}%</span></span>
            </div>
            {/* Bootstrap progress bar showing this slice's share */}
            <div className="progress legend-progress" role="progressbar" aria-label={`${x.label} share`} aria-valuenow={pct(x.value)} aria-valuemin={0} aria-valuemax={100}>
              <div className="progress-bar" style={{ width: `${pct(x.value)}%`, background: x.color }} />
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

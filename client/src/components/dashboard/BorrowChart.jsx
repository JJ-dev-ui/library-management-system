import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import Skeleton from 'react-loading-skeleton';
import useThemeColors from '../../hooks/useThemeColors';

const HEIGHT = 280;
// No grow-in animation for people who asked their system for reduced motion
const reduceMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// "2026-10-13" -> Date at noon (noon avoids time-zone edge cases when only the day matters)
const toDate = (ymd) => new Date(`${ymd}T12:00:00`);

// Grouped bar chart: books borrowed vs returned per day (Recharts).
// Colours come from the theme (useThemeColors), so the chart follows the selected theme.
export default function BorrowChart({ daily, range, loading }) {
  const c = useThemeColors();
  if (loading) return <Skeleton height={HEIGHT} borderRadius={8} />;

  // Short labels: weekday for 7 days ("Mon 13"), month + day otherwise ("Oct 13")
  const data = daily.map((d) => ({
    ...d,
    label: toDate(d.date).toLocaleDateString(undefined, range === 7 ? { weekday: 'short', day: 'numeric' } : { month: 'short', day: 'numeric' }),
  }));
  // Fewer x-axis labels for longer ranges so they never overlap
  const interval = range === 7 ? 0 : range === 30 ? 4 : 13;
  const totalBorrowed = daily.reduce((s, d) => s + d.borrowed, 0);
  const totalReturned = daily.reduce((s, d) => s + d.returned, 0);

  return (
    // role="img" + aria-label: screen readers get a one-sentence summary instead of SVG shapes
    <div role="img" aria-label={`Bar chart of the last ${range} days: ${totalBorrowed} books borrowed and ${totalReturned} returned.`}>
      <ResponsiveContainer width="100%" height={HEIGHT}>
        <BarChart data={data} barGap={2} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={c.border} />
          <XAxis dataKey="label" interval={interval} tickLine={false} axisLine={{ stroke: c.border }} tick={{ fill: c.muted, fontSize: 12, fontFamily: c.font }} />
          <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={36} tick={{ fill: c.muted, fontSize: 12, fontFamily: c.font }} />
          <Tooltip
            cursor={{ fill: c.border, opacity: 0.4 }}
            contentStyle={{ borderRadius: 8, border: `1px solid ${c.border}`, fontSize: 13, color: c.text, fontFamily: c.font }}
            labelFormatter={(_, payload) => (payload?.[0] ? toDate(payload[0].payload.date).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }) : '')}
          />
          <Legend iconType="circle" iconSize={10} wrapperStyle={{ fontSize: 13, color: c.text, fontFamily: c.font }} />
          <Bar dataKey="borrowed" name="Borrowed" fill={c.primary} radius={[4, 4, 0, 0]} maxBarSize={18} isAnimationActive={!reduceMotion} animationDuration={400} />
          <Bar dataKey="returned" name="Returned" fill={c.success} radius={[4, 4, 0, 0]} maxBarSize={18} isAnimationActive={!reduceMotion} animationDuration={400} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

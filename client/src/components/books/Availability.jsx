// "3 of 5 available" with a coloured dot: green = all on the shelf, amber = some borrowed, red = none left
export default function Availability({ book }) {
  const { availableCopies: a, totalCopies: t } = book;
  const tone = a === 0 ? 'out' : a < t ? 'some' : 'all';
  const text = a === 0 ? 'All borrowed' : `${a} of ${t} available`;
  return <span className={`avail-badge ${tone}`}>{text}</span>;
}

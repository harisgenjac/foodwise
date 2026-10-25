// The other units of a total as small chips under its main number, e.g. "12 l" and "40 kom".
// Renders nothing when there are no other units.
function UnitChips({ units }: { units: string[] }) {
  if (units.length === 0) return null;

  return (
    <ul data-testid="unit-chips" className="mt-2 flex flex-wrap gap-1.5">
      {units.map((unit) => (
        <li
          key={unit}
          className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs text-gray-600"
        >
          {unit}
        </li>
      ))}
    </ul>
  );
}

export default UnitChips;

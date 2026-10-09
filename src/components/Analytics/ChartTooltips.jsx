import PropTypes from "prop-types";
import formatCurrency from "../../utils/formatCurrency.jsx";

const Panel = ({ colors, children }) => (
  <div
    className="rounded-xl border px-3 py-2 text-sm shadow-lg"
    style={{ background: colors.background, borderColor: colors.border, color: colors.text }}
  >
    {children}
  </div>
);

const colorsShape = PropTypes.shape({
  background: PropTypes.string.isRequired,
  border: PropTypes.string.isRequired,
  text: PropTypes.string.isRequired,
});

Panel.propTypes = { colors: colorsShape.isRequired, children: PropTypes.node };

const seriesPropTypes = {
  active: PropTypes.bool,
  label: PropTypes.string,
  colors: colorsShape.isRequired,
  payload: PropTypes.arrayOf(PropTypes.shape({
    name: PropTypes.string,
    value: PropTypes.number,
    color: PropTypes.string,
  })),
};

/** Tooltip for charts that compare several series (area and bar charts). */
export const SeriesTooltip = ({ active, payload, label, colors }) => {
  if (!active || !payload?.length) return null;
  return (
    <Panel colors={colors}>
      <p className="font-semibold mb-1">{label}</p>
      {payload.map((entry, index) => (
        <p key={index} className="flex items-center gap-2 tabular-nums"><span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: entry.color }} />
          {entry.name}: {formatCurrency(entry.value)}
        </p>
      ))}
    </Panel>
  );
};
SeriesTooltip.propTypes = seriesPropTypes;

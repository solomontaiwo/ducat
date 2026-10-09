import PropTypes from "prop-types";
import { Legend, Pie, PieChart, ResponsiveContainer, Sector, Tooltip } from "recharts";
import formatCurrency from "../../utils/formatCurrency.jsx";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { PieTooltip } from "./ChartTooltips.jsx";

const CategoryPieSector = (props) => <Sector {...props} />;

/** Donut chart plus ranked progress bars for the top categories of one type. */
const CategoryDistributionCard = ({ title, categories, pieData, palette, amountClass, emptyMessage, axisColor, tooltipColors }) => (
  <Card>
    <CardHeader>
      <CardTitle>{title}</CardTitle>
    </CardHeader>
    <CardContent className="space-y-4">
      {categories?.length ? (
        <>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={65}
                outerRadius={105}
                paddingAngle={3}
                dataKey="amount"
                nameKey="label"
                shape={CategoryPieSector}
              />
              <Tooltip content={<PieTooltip colors={tooltipColors} />} isAnimationActive={false} />
              <Legend
                formatter={(value) => (
                  <span style={{ color: axisColor, fontSize: 12 }}>{value}</span>
                )}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-3">
            {categories.map((category, index) => {
              const color = palette[index % palette.length];
              return (
                <div key={category.category} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: color }} />
                      <span className="font-semibold">{category.label}</span>
                    </div>
                    <span className={`${amountClass} font-semibold`}>{formatCurrency(category.amount)}</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-muted">
                    <div className="h-2 rounded-full" style={{ width: `${category.percentage.toFixed(1)}%`, background: color }} />
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
      )}
    </CardContent>
  </Card>
);

CategoryDistributionCard.propTypes = {
  title: PropTypes.string.isRequired,
  categories: PropTypes.arrayOf(PropTypes.shape({
    category: PropTypes.string.isRequired,
    label: PropTypes.string.isRequired,
    amount: PropTypes.number.isRequired,
    percentage: PropTypes.number.isRequired,
  })),
  pieData: PropTypes.array.isRequired,
  palette: PropTypes.arrayOf(PropTypes.string).isRequired,
  amountClass: PropTypes.string.isRequired,
  emptyMessage: PropTypes.string.isRequired,
  axisColor: PropTypes.string.isRequired,
  tooltipColors: PropTypes.object.isRequired,
};

export default CategoryDistributionCard;

import PropTypes from "prop-types";
import { FiChevronRight } from "react-icons/fi";
import { Link } from "../../router/RouterProvider";
import { cn } from "../../lib/utils";

/** Grouped settings list, iOS-style: a caption and a card of rows. */
export const SettingsGroup = ({ title, children, className }) => (
  <section className={cn("space-y-2", className)} aria-label={title}>
    {title && <h2 className="px-1.5 font-sans text-xs font-extrabold uppercase tracking-[0.06em] text-muted-foreground">{title}</h2>}
    <div className="surface divide-y divide-border overflow-hidden">{children}</div>
  </section>
);

SettingsGroup.propTypes = {
  title: PropTypes.string,
  children: PropTypes.node,
  className: PropTypes.string,
};

const TONES = {
  blue: "bg-accent text-accent-foreground",
  amber: "bg-warning/15 text-warning-strong",
  green: "bg-income/10 text-income",
  neutral: "bg-muted text-foreground",
};

/**
 * One row. With `to` it is a link, with `onClick` a button; `trailing`
 * replaces the chevron (e.g. a segmented control).
 */
export const SettingsRow = ({ icon: Icon, tone = "neutral", title, subtitle, subtitleTone, badge, to, onClick, trailing, testId }) => {
  const content = (
    <>
      {Icon && (
        <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", TONES[tone])} aria-hidden="true">
          <Icon className="h-[17px] w-[17px]" />
        </span>
      )}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex items-center gap-2 text-[15px] font-semibold leading-snug">
          <span className="truncate">{title}</span>
          {badge && <span className="shrink-0 rounded-md bg-accent px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-accent-foreground">{badge}</span>}
        </span>
        {subtitle && (
          <span className={cn("truncate text-[13px]", subtitleTone === "warning" ? "font-semibold text-warning-strong" : "text-muted-foreground")}>
            {subtitle}
          </span>
        )}
      </span>
      {trailing ?? ((to || onClick) && <FiChevronRight className="h-5 w-5 shrink-0 text-muted-foreground/70" aria-hidden="true" />)}
    </>
  );
  const base = "flex w-full min-w-0 items-center gap-3 px-4 py-3 text-left";
  const interactive = "transition-colors hover:bg-muted/50 focus-visible:bg-muted/50";
  if (to) return <Link to={to} className={cn(base, interactive)} data-testid={testId}>{content}</Link>;
  if (onClick) return <button type="button" onClick={onClick} className={cn(base, interactive)} data-testid={testId}>{content}</button>;
  return <div className={cn(base, "flex-wrap")} data-testid={testId}>{content}</div>;
};

SettingsRow.propTypes = {
  icon: PropTypes.elementType,
  tone: PropTypes.oneOf(Object.keys(TONES)),
  title: PropTypes.string.isRequired,
  subtitle: PropTypes.string,
  subtitleTone: PropTypes.oneOf(["warning"]),
  badge: PropTypes.string,
  to: PropTypes.string,
  onClick: PropTypes.func,
  trailing: PropTypes.node,
  testId: PropTypes.string,
};

/** Compact segmented control for inline choices (theme, language, …). */
export const InlineSegmented = ({ label, options, value, onChange }) => (
  <div role="radiogroup" aria-label={label} className="flex shrink-0 gap-0.5 rounded-xl bg-muted p-0.5">
    {options.map((option) => (
      <button
        key={option.value}
        type="button"
        role="radio"
        aria-checked={value === option.value}
        onClick={() => onChange(option.value)}
        className={cn(
          "h-8 rounded-[10px] px-2.5 text-[13px] font-semibold transition-colors",
          value === option.value ? "bg-card text-foreground shadow-sm dark:bg-input" : "text-muted-foreground hover:text-foreground"
        )}
      >
        {option.label}
      </button>
    ))}
  </div>
);

InlineSegmented.propTypes = {
  label: PropTypes.string.isRequired,
  options: PropTypes.arrayOf(PropTypes.shape({ value: PropTypes.string, label: PropTypes.string })).isRequired,
  value: PropTypes.string,
  onChange: PropTypes.func.isRequired,
};

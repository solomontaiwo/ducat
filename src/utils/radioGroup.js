/**
 * Arrow/Home/End navigation for `role="radiogroup"` controls built from
 * buttons. Attach it to the group or to each radio; focus follows selection.
 */
export const handleRadioKeyDown = (event, values, selected, onSelect) => {
  if (!values.length) return;
  const index = Math.max(0, values.indexOf(selected));
  let nextIndex;
  switch (event.key) {
    case "ArrowRight":
    case "ArrowDown":
      nextIndex = (index + 1) % values.length;
      break;
    case "ArrowLeft":
    case "ArrowUp":
      nextIndex = (index - 1 + values.length) % values.length;
      break;
    case "Home":
      nextIndex = 0;
      break;
    case "End":
      nextIndex = values.length - 1;
      break;
    default:
      return;
  }
  event.preventDefault();
  onSelect(values[nextIndex]);
  const target = event.currentTarget;
  const group = target.closest?.('[role="radio"]') ? target.parentElement : target;
  window.requestAnimationFrame(() => {
    group?.querySelectorAll('[role="radio"]')[nextIndex]?.focus();
  });
};

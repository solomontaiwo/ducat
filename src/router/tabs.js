/**
 * The three main destinations. They stay mounted once opened (switching back is
 * instant and keeps scroll, month and filters), cross-fade when switching, and
 * are the destinations of the native tab bar on the iPhone Duo.
 */
export const TAB_PATHS = Object.freeze(["/dashboard", "/transactions", "/analytics"]);

export const isTabPath = (pathname) => TAB_PATHS.includes(pathname);

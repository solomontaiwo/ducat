export const resolveRouteAccess = ({ access, currentUser, isDemo, pathname }) => {
  if (access === "public") return null;
  if (access === "public-only") {
    if (!currentUser) return null;
    return currentUser.emailVerified ? "/dashboard" : "/verify-email";
  }
  if (access === "authenticated") {
    if (!currentUser) return "/login";
    // Waiting for the email confirmation: there is no session yet.
    return currentUser.pending ? "/verify-email" : null;
  }
  if (access === "authenticated-unverified") {
    if (!currentUser) return "/login";
    return currentUser.emailVerified ? "/dashboard" : null;
  }
  if (access === "app") {
    if (isDemo) return null;
    if (!currentUser) return "/login";
    if (!currentUser.emailVerified) return "/verify-email";
    return null;
  }
  return pathname === "/" ? null : "/";
};

export const COOKIE_NAME = "session_token";
export const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

// Generate GitHub login URL at runtime so redirect URI reflects the current origin.
// Force redeploy: v2
export const getLoginUrl = (returnPath?: string) => {
  const clientId = import.meta.env.VITE_GITHUB_CLIENT_ID;
  const redirectUri = `${window.location.origin}/api/oauth/callback`;
  const state = btoa(JSON.stringify({ returnPath: returnPath || "/" }));

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: "user:email",
    state,
  });

  return `https://github.com/login/oauth/authorize?${params.toString()}`;
};

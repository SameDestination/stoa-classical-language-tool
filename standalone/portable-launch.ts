/**
 * Portable-web launch preparation.
 *
 * The loopback launcher adds a unique `stoa-launch` query parameter for every
 * server process.  Seeing that parameter means this is a new portable-app
 * session, so discard browser-cached working documents before React hydrates.
 * Device libraries (user fonts and MDX/MDD dictionaries) and durable user
 * preferences intentionally live outside this reset list.
 */

export const PORTABLE_LAUNCH_QUERY_PARAMETER = "stoa-launch" as const;

export const PORTABLE_WORKING_LOCAL_STORAGE_KEYS = [
  "stoa-studio-language",
  "stoa-studio-settings",
  "stoa-official-sample-open-state-v1",
  "stoa-working-projects-v1",
] as const;

export const PORTABLE_WORKING_SESSION_STORAGE_KEYS = [
  "stoa-manual-ai-session-v1",
  "stoa-manual-ai-drafts-v1",
] as const;

type StorageLike = Pick<Storage, "removeItem">;

export type PortableLaunchEnvironment = {
  href: string;
  localStorage: StorageLike;
  sessionStorage: StorageLike;
  replaceUrl: (url: string) => void;
};

export type PortableLaunchPreparation = {
  reset: boolean;
  cleanUrl: string | null;
};

const removeKeys = (storage: StorageLike, keys: readonly string[]) => {
  for (const key of keys) storage.removeItem(key);
};

/**
 * Reset only document/session state for an explicit launcher visit.
 *
 * A normal refresh has no launch parameter (it is removed with replaceState),
 * so edits remain intact for the lifetime of the current portable session.
 */
export const preparePortableLaunch = (
  environment: PortableLaunchEnvironment,
): PortableLaunchPreparation => {
  let url: URL;
  try {
    url = new URL(environment.href);
  } catch {
    return { reset: false, cleanUrl: null };
  }

  if (!url.searchParams.has(PORTABLE_LAUNCH_QUERY_PARAMETER)) {
    return { reset: false, cleanUrl: null };
  }

  try {
    removeKeys(environment.localStorage, PORTABLE_WORKING_LOCAL_STORAGE_KEYS);
  } catch {
    // Storage can be disabled by browser policy. STOA can still run in memory.
  }
  try {
    removeKeys(environment.sessionStorage, PORTABLE_WORKING_SESSION_STORAGE_KEYS);
  } catch {
    // Session recovery is best-effort in the existing editor as well.
  }

  url.searchParams.delete(PORTABLE_LAUNCH_QUERY_PARAMETER);
  const remainingQuery = url.searchParams.toString();
  const cleanUrl = `${url.pathname}${remainingQuery ? `?${remainingQuery}` : ""}${url.hash}`;
  try {
    environment.replaceUrl(cleanUrl);
  } catch {
    // A failed cosmetic URL cleanup must not prevent application startup.
  }

  return { reset: true, cleanUrl };
};

export const prepareCurrentPortableLaunch = () => preparePortableLaunch({
  href: window.location.href,
  localStorage: window.localStorage,
  sessionStorage: window.sessionStorage,
  replaceUrl: (url) => window.history.replaceState(window.history.state, "", url),
});

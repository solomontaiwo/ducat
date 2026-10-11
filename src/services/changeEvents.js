// Writes made on this device notify the open subscriptions right away;
// changes from other devices arrive through Supabase Realtime.
const listeners = new Map();

export const onLocalChange = (topic, listener) => {
  if (!listeners.has(topic)) listeners.set(topic, new Set());
  listeners.get(topic).add(listener);
  return () => listeners.get(topic)?.delete(listener);
};

export const emitLocalChange = (topic) => {
  for (const listener of [...(listeners.get(topic) || [])]) {
    try {
      listener();
    } catch (error) {
      console.error("Change listener failed", error);
    }
  }
};

let channelSequence = 0;

/**
 * Calls `reload` now, after every local write on `topic` and after every
 * Realtime change to `table` rows owned by `userId`. Bursts are coalesced.
 */
export const watchTable = ({ supabase, table, topic = table, userId, reload, delayMs = 60 }) => {
  let active = true;
  let timer = null;
  const schedule = () => {
    if (!active) return;
    clearTimeout(timer);
    timer = setTimeout(() => { if (active) reload(); }, delayMs);
  };
  const stopLocal = onLocalChange(topic, schedule);
  let channel = null;
  try {
    channelSequence += 1;
    channel = supabase
      .channel(`${table}:${userId}:${channelSequence}`)
      .on("postgres_changes", { event: "*", schema: "public", table, filter: `user_id=eq.${userId}` }, schedule)
      // Delete payloads can lack user_id; reload through the owner's RLS-protected query.
      .on("postgres_changes", { event: "DELETE", schema: "public", table }, schedule)
      .subscribe((status) => { if (status === "SUBSCRIBED") schedule(); });
  } catch (error) {
    console.warn(`Realtime unavailable for ${table}`, error);
  }
  reload();
  const onVisible = () => { if (document.visibilityState === "visible") schedule(); };
  window.addEventListener("online", schedule);
  window.addEventListener("focus", schedule);
  document.addEventListener("visibilitychange", onVisible);
  return () => {
    active = false;
    clearTimeout(timer);
    stopLocal();
    window.removeEventListener("online", schedule);
    window.removeEventListener("focus", schedule);
    document.removeEventListener("visibilitychange", onVisible);
    if (channel) supabase.removeChannel(channel);
  };
};

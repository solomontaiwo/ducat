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
      .subscribe();
  } catch (error) {
    console.warn(`Realtime unavailable for ${table}`, error);
  }
  reload();
  return () => {
    active = false;
    clearTimeout(timer);
    stopLocal();
    if (channel) supabase.removeChannel(channel);
  };
};

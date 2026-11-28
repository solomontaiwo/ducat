import { supabase, unwrap } from "../utils/supabaseClient.js";
import { emitLocalChange, watchTable } from "./changeEvents.js";
import { createVaultPairing } from "../utils/vaultCrypto.js";

export const normalizePairingCode = (value) => value.toLowerCase().replace(/[\s-]/g, "");
export const formatPairingCode = (value) => value.match(/.{4}/g).join(" ").toUpperCase();

export const requestVaultPairing = async (uid) => {
  const request = await createVaultPairing();
  const args = { p_user: uid, p_id: request.id, p_receiver: request.publicKey };
  const result = await supabase.rpc("start_vault_pairing_automatic", args);
  if (result.error?.code === "PGRST202" || (!result.error && !result.data)) {
    if (!unwrap(await supabase.rpc("start_vault_pairing", args))) throw new Error("Could not start pairing");
    return request;
  }
  unwrap(result);
  return { ...request, automatic: true };
};

const table = "vault_pairings";

export const watchVaultPairings = (uid, reload) =>
  watchTable({ supabase, table, userId: uid, reload, watchDeletes: false });

export const listPendingVaultPairings = async (uid) => unwrap(await supabase.from(table)
  .select("id,expires_at").eq("user_id", uid).is("ciphertext", null).is("rejected_at", null)
  .order("expires_at", { ascending: false }));

// Older schemas omit rejected_at. Keep manual pairing available during rollout.
export const readVaultPairing = async (uid, id) => unwrap(await supabase.from(table)
  .select().eq("user_id", uid).eq("id", id).maybeSingle());

export const readVaultPairingKeyCheck = async (uid) => unwrap(await supabase.from("vault_accounts")
  .select("pairing_key_check").eq("user_id", uid).eq("active", true).maybeSingle())?.pairing_key_check;

export const approveVaultPairing = async (vault, id) => {
  const request = await readVaultPairing(vault.uid, id);
  if (!request || request.ciphertext || request.rejected_at) return null;
  const receiver = request.receiver_public;
  const { sender, ciphertext, confirmation, keyCheck } = await vault.pairDevice(id, receiver);
  if (!vault.isOpen()) throw new Error("Archive is locked");
  const args = { p_user: vault.uid, p_id: id, p_receiver: receiver, p_sender: sender, p_ciphertext: ciphertext };
  const automatic = Boolean(request.request_session);
  const sent = unwrap(await (automatic
    ? supabase.rpc("approve_vault_pairing_automatic", { ...args, p_key_check: keyCheck })
    : supabase.rpc("approve_vault_pairing", args)));
  if (sent) emitLocalChange(table);
  return sent ? { automatic, confirmation } : null;
};

export const cancelVaultPairing = async (uid, id) =>
  unwrap(await supabase.rpc("remove_vault_pairing", { p_user: uid, p_id: id }));

export const rejectVaultPairing = async (vault, id) => {
  if (!vault.canPair()) throw new Error("Archive is locked");
  const rejected = unwrap(await supabase.rpc("reject_vault_pairing", { p_user: vault.uid, p_id: id }));
  if (rejected) emitLocalChange(table);
  return rejected;
};

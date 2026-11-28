import { supabase, unwrap } from "../utils/supabaseClient.js";
import { emitLocalChange, watchTable } from "./changeEvents.js";
import { createVaultPairing } from "../utils/vaultCrypto.js";

export const normalizePairingCode = (value) => value.toLowerCase().replace(/[\s-]/g, "");
export const formatPairingCode = (value) => value.match(/.{4}/g).join(" ").toUpperCase();

export const requestVaultPairing = async (uid) => {
  const request = await createVaultPairing();
  if (!unwrap(await supabase.rpc("start_vault_pairing", {
    p_user: uid, p_id: request.id, p_receiver: request.publicKey,
  }))) throw new Error("Could not start pairing");
  return request;
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

export const approveVaultPairing = async (vault, id) => {
  const request = await readVaultPairing(vault.uid, id);
  if (!request || request.ciphertext || request.rejected_at) return null;
  const receiver = request.receiver_public;
  const { sender, ciphertext, confirmation } = await vault.pairDevice(id, receiver);
  if (!vault.isOpen()) throw new Error("Archive is locked");
  const sent = unwrap(await supabase.rpc("approve_vault_pairing", {
    p_user: vault.uid, p_id: id, p_receiver: receiver, p_sender: sender, p_ciphertext: ciphertext,
  }));
  if (sent) emitLocalChange(table);
  return sent ? confirmation : null;
};

export const cancelVaultPairing = async (uid, id) =>
  unwrap(await supabase.rpc("remove_vault_pairing", { p_user: uid, p_id: id }));

export const rejectVaultPairing = async (vault, id) => {
  if (!vault.canPair()) throw new Error("Archive is locked");
  const rejected = unwrap(await supabase.rpc("reject_vault_pairing", { p_user: vault.uid, p_id: id }));
  if (rejected) emitLocalChange(table);
  return rejected;
};

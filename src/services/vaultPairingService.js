import { supabase, unwrap } from "../utils/supabaseClient.js";
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

export const readVaultPairing = async (uid, id) => unwrap(await supabase.from("vault_pairings")
  .select("receiver_public,sender_public,ciphertext").eq("user_id", uid).eq("id", id).maybeSingle());

export const approveVaultPairing = async (vault, id) => {
  const request = await readVaultPairing(vault.uid, id);
  if (!request || request.ciphertext) return null;
  const receiver = request.receiver_public;
  const { sender, ciphertext, confirmation } = await vault.pairDevice(id, receiver);
  if (!vault.isOpen()) throw new Error("Archive is locked");
  const sent = unwrap(await supabase.rpc("approve_vault_pairing", {
    p_user: vault.uid, p_id: id, p_receiver: receiver, p_sender: sender, p_ciphertext: ciphertext,
  }));
  return sent ? confirmation : null;
};

export const cancelVaultPairing = async (uid, id) =>
  unwrap(await supabase.rpc("remove_vault_pairing", { p_user: uid, p_id: id }));

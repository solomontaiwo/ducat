const encoder = new TextEncoder();
const decoder = new TextDecoder();
const random = (length) => crypto.getRandomValues(new Uint8Array(length));
const iterations = 600_000;

export const encodeBytes = (bytes) => {
  const chunks = [];
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 8192)));
  }
  return btoa(chunks.join(""));
};
export const decodeBytes = (value) => Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
const hex = (value) => Array.from(value, (byte) => byte.toString(16).padStart(2, "0")).join("");
const aes = (bytes) => crypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["encrypt", "decrypt"]);
const context = (...parts) => JSON.stringify(["ducat-vault", 1, ...parts]);

const encrypt = async (key, bytes, scope) => {
  const iv = random(12);
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({
    name: "AES-GCM", iv, additionalData: encoder.encode(scope),
  }, key, bytes));
  const payload = new Uint8Array(iv.length + encrypted.length);
  payload.set(iv);
  payload.set(encrypted, iv.length);
  return encodeBytes(payload);
};

const decrypt = async (key, value, scope) => {
  const payload = decodeBytes(value);
  if (payload.length < 28) throw new Error("Invalid encrypted payload");
  return crypto.subtle.decrypt({
    name: "AES-GCM", iv: payload.subarray(0, 12), additionalData: encoder.encode(scope),
  }, key, payload.subarray(12));
};

const passphraseKey = async (passphrase, salt) => {
  const material = await crypto.subtle.importKey("raw", encoder.encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, material,
    { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
};

const recoveryKey = (code) => {
  const normalized = code.replace(/[\s-]/g, "").toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(normalized)) throw new Error("Invalid recovery code");
  return aes(Uint8Array.from(normalized.match(/../g), (byte) => parseInt(byte, 16)));
};

export const newRecoveryCode = () => hex(random(32)).match(/.{8}/g).join("-");

export const createVaultKeys = async (uid, passphrase, recovery) => {
  const secret = random(32);
  const salt = random(16);
  try {
    const [passwordKey, codeKey] = await Promise.all([passphraseKey(passphrase, salt), recoveryKey(recovery)]);
    const [password, fallback] = await Promise.all([
      encrypt(passwordKey, secret, context(uid, "wrap-password")),
      encrypt(codeKey, secret, context(uid, "wrap-recovery")),
    ]);
    return { v: 1, salt: encodeBytes(salt), password, recovery: fallback };
  } finally {
    secret.fill(0);
  }
};

export const unwrapVaultKey = async (uid, keys, credential, recovery = false) => {
  if (keys?.v !== 1) throw new Error("Unsupported archive version");
  const key = recovery ? await recoveryKey(credential) : await passphraseKey(credential, decodeBytes(keys.salt));
  const wrapped = recovery ? keys.recovery : keys.password;
  return new Uint8Array(await decrypt(key, wrapped, context(uid, recovery ? "wrap-recovery" : "wrap-password")));
};

export const vaultCrypto = async (uid, secret) => {
  if (secret.length !== 32) throw new Error("Invalid archive key");
  const material = await crypto.subtle.importKey("raw", secret, "HKDF", false, ["deriveKey"]);
  const derive = (purpose, algorithm, usages) => crypto.subtle.deriveKey({
    name: "HKDF", hash: "SHA-256", salt: encoder.encode(uid), info: encoder.encode(context(purpose)),
  }, material, algorithm, false, usages);
  const [key, idKey] = await Promise.all([
    derive("data", { name: "AES-GCM", length: 256 }, ["encrypt", "decrypt"]),
    derive("id", { name: "HMAC", hash: "SHA-256", length: 256 }, ["sign"]),
  ]);
  return {
    async id(kind, id) {
      return hex(new Uint8Array(await crypto.subtle.sign("HMAC", idKey, encoder.encode(context(kind, id)))));
    },
    seal: (value, name, id = null) => encrypt(key, encoder.encode(JSON.stringify(value)), context(uid, name, id)),
    open: async (value, name, id = null) => JSON.parse(decoder.decode(await decrypt(key, value, context(uid, name, id)))),
  };
};

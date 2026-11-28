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

const deriveUnlockKey = async (credential, salt) => {
  const material = await crypto.subtle.importKey("raw", credential, "PBKDF2", false, ["deriveKey"]);
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
    const [passwordKey, codeKey] = await Promise.all([deriveUnlockKey(encoder.encode(passphrase), salt), recoveryKey(recovery)]);
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
  if (keys?.v !== 1 && !(keys?.v === 2 && recovery)) throw new Error("Unsupported archive credential");
  const key = recovery ? await recoveryKey(credential) : await deriveUnlockKey(encoder.encode(credential), decodeBytes(keys.salt));
  const wrapped = recovery ? keys.recovery : keys.password;
  return new Uint8Array(await decrypt(key, wrapped, context(uid, recovery ? "wrap-recovery" : "wrap-password")));
};

export const createRecoveryVault = async (uid, recovery) => {
  const secret = random(32);
  try {
    const encrypted = await encrypt(await recoveryKey(recovery), secret, context(uid, "wrap-recovery"));
    return { secret, keys: { v: 2, recovery: encrypted } };
  } catch (error) {
    secret.fill(0);
    throw error;
  }
};

export const isVaultPin = (pin) => /^[0-9]{6}$/.test(pin);

const pinKey = async (uid, recovery, pin, deviceKey, salt) => {
  if (!isVaultPin(pin)) throw new Error("Invalid archive PIN");
  const material = new Uint8Array(await crypto.subtle.sign("HMAC", deviceKey, encoder.encode(context(uid, recovery, pin))));
  try {
    return await deriveUnlockKey(material, salt);
  } finally {
    material.fill(0);
  }
};

export const createDevicePin = async (uid, recovery, pin, secret) => {
  const deviceKey = await crypto.subtle.generateKey({ name: "HMAC", hash: "SHA-256", length: 256 }, false, ["sign"]);
  const salt = random(16);
  const key = await pinKey(uid, recovery, pin, deviceKey, salt);
  const ciphertext = await encrypt(key, secret, context(uid, "device-pin", recovery));
  return { deviceKey, salt, ciphertext, recovery, attempts: 0 };
};

export const unlockDevicePin = async (uid, saved, pin) => {
  const key = await pinKey(uid, saved.recovery, pin, saved.deviceKey, saved.salt);
  return new Uint8Array(await decrypt(key, saved.ciphertext, context(uid, "device-pin", saved.recovery)));
};

export const deviceSessionCrypto = async (uid, saved) => {
  const scope = context(uid, "device-session", saved.recovery, saved.ciphertext);
  const material = new Uint8Array(await crypto.subtle.sign("HMAC", saved.deviceKey, encoder.encode(scope)));
  try {
    const key = await aes(material);
    return {
      seal: (value) => encrypt(key, encoder.encode(JSON.stringify(value)), scope),
      open: async (value) => JSON.parse(decoder.decode(await decrypt(key, value, scope))),
    };
  } finally {
    material.fill(0);
  }
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

const pairingCurve = { name: "ECDH", namedCurve: "P-256" };
const generatePairingKeys = async () => {
  const { publicKey, privateKey } = await crypto.subtle.generateKey(pairingCurve, false, ["deriveBits"]);
  return { privateKey, publicKey: encodeBytes(new Uint8Array(await crypto.subtle.exportKey("raw", publicKey))) };
};

const pairingId = async (publicKey) => hex(new Uint8Array(
  await crypto.subtle.digest("SHA-256", decodeBytes(publicKey))
)).slice(0, 16);

export const createVaultPairing = async () => {
  const keys = await generatePairingKeys();
  return { ...keys, id: await pairingId(keys.publicKey) };
};

const pairingCipher = async (uid, id, receiver, sender, privateKey, peer) => {
  const publicKey = await crypto.subtle.importKey("raw", decodeBytes(peer), pairingCurve, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: publicKey }, privateKey, 256));
  const scope = context(uid, "pair-device", id, receiver, sender);
  try {
    const material = await crypto.subtle.importKey("raw", shared, "HKDF", false, ["deriveBits"]);
    const derive = (purpose, length) => crypto.subtle.deriveBits({
      name: "HKDF", hash: "SHA-256", salt: encoder.encode(scope), info: encoder.encode(context(purpose)),
    }, material, length);
    const [key, confirmation] = await Promise.all([derive("encryption", 256), derive("confirmation", 48)]);
    const bytes = new Uint8Array(key);
    try {
      return { key: await aes(bytes), confirmation: hex(new Uint8Array(confirmation)), scope };
    } finally {
      bytes.fill(0);
    }
  } finally {
    shared.fill(0);
  }
};

export const encryptVaultPairing = async (uid, id, receiver, secret) => {
  if (await pairingId(receiver) !== id) throw new Error("Pairing code does not match this device");
  const sender = await generatePairingKeys();
  const cipher = await pairingCipher(uid, id, receiver, sender.publicKey, sender.privateKey, receiver);
  return {
    sender: sender.publicKey,
    ciphertext: await encrypt(cipher.key, secret, cipher.scope),
    confirmation: cipher.confirmation,
  };
};

export const vaultPairingConfirmation = async (uid, request, sender) =>
  (await pairingCipher(uid, request.id, request.publicKey, sender, request.privateKey, sender)).confirmation;

export const decryptVaultPairing = async (uid, request, { sender_public: sender, ciphertext }, confirmation) => {
  const cipher = await pairingCipher(uid, request.id, request.publicKey, sender, request.privateKey, sender);
  if (cipher.confirmation !== confirmation) throw new Error("Pairing confirmation does not match");
  return new Uint8Array(await decrypt(cipher.key, ciphertext, cipher.scope));
};

export const openApprovedVaultPairing = async (uid, request, { sender_public: sender, ciphertext }, keyCheck) => {
  const cipher = await pairingCipher(uid, request.id, request.publicKey, sender, request.privateKey, sender);
  const bytes = new Uint8Array(await decrypt(cipher.key, ciphertext, cipher.scope));
  try {
    if (await (await vaultCrypto(uid, bytes)).id("pairing-key", uid) !== keyCheck) {
      throw new Error("Invalid archive key");
    }
    return bytes;
  } catch (error) {
    bytes.fill(0);
    throw error;
  }
};

export const createPairedVaultSession = async (uid, authSession, recovery, secret) => {
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  const sealed = await encrypt(key, secret, context(uid, "paired-session", authSession, recovery));
  return { key, sealed, authSession };
};

export const openPairedVaultSession = async (uid, authSession, recovery, { key, sealed }) =>
  new Uint8Array(await decrypt(key, sealed, context(uid, "paired-session", authSession, recovery)));

let archive = null;

export const currentVault = (uid) => archive && (!uid || archive.uid === uid) ? archive : null;

export const setCurrentVault = (next) => {
  if (archive && archive !== next) archive.close();
  archive = next;
};

export const vaultRecord = (kind, id, value) => ({ kind, id, value });

export const readLocalValue = (key, fallback = null) => {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
};

export const writeLocalValue = (key, value) => {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
};

export const removeLocalValue = (key) => {
  try {
    localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
};

// Restore earlier values if a write fails (for example, when storage is full).
export const writeLocalBatch = (entries) => {
  const previous = [];
  try {
    for (const [key, value] of entries) {
      previous.push([key, localStorage.getItem(key)]);
      localStorage.setItem(key, value);
    }
    return true;
  } catch {
    for (const [key, value] of previous.reverse()) {
      try {
        if (value === null) localStorage.removeItem(key);
        else localStorage.setItem(key, value);
      } catch { /* Storage can also be unavailable during rollback. */ }
    }
    return false;
  }
};

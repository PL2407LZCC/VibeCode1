const toArray = (value: string | string[] | undefined) => {
  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value === 'string') {
    return [value];
  }

  return [];
};

export const getHeaderValue = (value: string | string[] | undefined) => {
  for (const entry of toArray(value)) {
    if (typeof entry === 'string') {
      return entry;
    }
  }

  return null;
};

export const getTrimmedHeaderValue = (value: string | string[] | undefined) => {
  const header = getHeaderValue(value);
  if (!header) {
    return null;
  }

  const trimmed = header.trim();
  return trimmed.length === 0 ? null : trimmed;
};

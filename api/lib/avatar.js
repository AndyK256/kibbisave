const MAX_BYTES = 350000;
const DATA_URL_RE = /^data:image\/(jpeg|png|webp);base64,/i;

function validateAvatarDataUrl(dataUrl) {
  if (!dataUrl || typeof dataUrl !== 'string') {
    throw new Error('INVALID_IMAGE');
  }

  const trimmed = dataUrl.trim();
  if (!DATA_URL_RE.test(trimmed)) {
    throw new Error('INVALID_TYPE');
  }

  const base64 = trimmed.split(',')[1];
  if (!base64) {
    throw new Error('INVALID_IMAGE');
  }

  let bytes;
  try {
    bytes = Buffer.from(base64, 'base64');
  } catch {
    throw new Error('INVALID_IMAGE');
  }

  if (!bytes.length || bytes.length > MAX_BYTES) {
    throw new Error('IMAGE_TOO_LARGE');
  }

  return trimmed;
}

module.exports = { validateAvatarDataUrl, MAX_BYTES };

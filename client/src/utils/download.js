// Helpers for files downloaded through the API (exports, import templates, error reports).

// Saves a Blob as a file: a temporary <a download> link is clicked, then the memory is released.
export function saveBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000); // give the browser a moment to start the download
}

// File name from a header like: attachment; filename="stacks-books-2026-10-14-0912.xlsx"
export function fileNameFrom(headers, fallback) {
  const match = /filename="?([^";]+)"?/i.exec(headers?.['content-disposition'] || '');
  return match ? match[1] : fallback;
}

// With responseType 'blob', an error response (JSON) also arrives as a Blob: read it back as text
// so the server's message ("PDF exports are limited to 2,000 rows…") can be shown.
export async function blobErrorMessage(err, fallback = 'Something went wrong. Please try again.') {
  const data = err.response?.data;
  if (data instanceof Blob) {
    try { return JSON.parse(await data.text()).message || fallback; } catch { return fallback; }
  }
  return data?.message || fallback;
}

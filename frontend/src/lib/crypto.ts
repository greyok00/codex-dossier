export async function sha256Hex(input: ArrayBuffer | Uint8Array | string) {
  const sourceBytes =
    typeof input === "string"
      ? new TextEncoder().encode(input)
      : input instanceof Uint8Array
        ? input
        : new Uint8Array(input);

  const bytes = Uint8Array.from(sourceBytes);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

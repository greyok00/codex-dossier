import { readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";

import { ServiceUnavailableError, ValidationError } from "../../lib/errors.js";
import type { AudioUpload } from "../contracts.js";
import type { AudioUploadResolver, ResolvedAudioUpload } from "./types.js";

export class DefaultAudioUploadResolver implements AudioUploadResolver {
  constructor(private readonly objectStorageRoot = process.env.AI_OBJECT_STORAGE_ROOT ?? null) {}

  async resolve(upload: AudioUpload): Promise<ResolvedAudioUpload> {
    if (upload.upload_mode === "inline_base64") {
      return {
        filename: upload.filename,
        mime_type: upload.mime_type,
        size_bytes: upload.size_bytes,
        content: decodeBase64(upload.content_base64, upload.size_bytes),
      };
    }

    if (!this.objectStorageRoot) {
      throw new ServiceUnavailableError("Object storage audio resolution is not configured.");
    }

    const root = resolve(this.objectStorageRoot);
    const filePath = resolve(root, upload.object_key);
    if (filePath !== root && !filePath.startsWith(`${root}${sep}`)) {
      throw new ValidationError("Object storage key is invalid.");
    }

    let content: Buffer;
    try {
      content = await readFile(filePath);
    } catch (error) {
      throw new ValidationError("Object storage audio could not be read.", error);
    }

    return {
      filename: upload.filename,
      mime_type: upload.mime_type,
      size_bytes: upload.size_bytes,
      content,
    };
  }
}

function decodeBase64(contentBase64: string, declaredSize: number) {
  let content: Buffer;
  try {
    content = Buffer.from(contentBase64, "base64");
  } catch (error) {
    throw new ValidationError("Inline audio content is not valid base64.", error);
  }

  if (content.byteLength === 0) {
    throw new ValidationError("Inline audio content is empty.");
  }
  if (declaredSize > 0 && content.byteLength !== declaredSize) {
    throw new ValidationError("Inline audio size does not match size_bytes.", {
      declared_size_bytes: declaredSize,
      actual_size_bytes: content.byteLength,
    });
  }

  return content;
}

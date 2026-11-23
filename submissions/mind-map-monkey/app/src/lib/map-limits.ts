import { UserFacingError } from "@/lib/app-errors";

export const MAX_FILE_BYTES = 1_000_000;
export const MAX_MAP_NODES = 2_000;
export const MAX_MAP_DEPTH = 64;

export class FileSizeError extends UserFacingError {
  constructor() {
    super("This content is larger than 1 MB and can't be opened here.");
  }
}

export function assertTextSize(text: string): void {
  if (text.length > MAX_FILE_BYTES || new TextEncoder().encode(text).byteLength > MAX_FILE_BYTES) {
    throw new FileSizeError();
  }
}

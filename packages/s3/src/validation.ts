type MagicBytesCheck = { offset: number; bytes: number[] };
type MagicBytesEntry = { format: string; checks: MagicBytesCheck[] };

// Order: webm (unique 4 bytes), mov (6 bytes ftypqt), mp4 (4 bytes ftyp), avi (RIFF+AVI)
const MAGIC_BYTES: MagicBytesEntry[] = [
  {
    format: 'webm',
    checks: [{ offset: 0, bytes: [0x1a, 0x45, 0xdf, 0xa3] }],
  },
  {
    format: 'mov',
    checks: [{ offset: 4, bytes: [0x66, 0x74, 0x79, 0x70, 0x71, 0x74] }], // ftypqt
  },
  {
    format: 'mp4',
    checks: [{ offset: 4, bytes: [0x66, 0x74, 0x79, 0x70] }], // ftyp
  },
  {
    format: 'avi',
    checks: [
      { offset: 0, bytes: [0x52, 0x49, 0x46, 0x46] }, // RIFF
      { offset: 8, bytes: [0x41, 0x56, 0x49, 0x20] }, // AVI
    ],
  },
];

const MIN_BYTES_NEEDED = 12; // AVI check needs offset 8 + 4 bytes

export function validateMagicBytes(bytes: Uint8Array): { valid: boolean; format: string | null } {
  if (bytes.length < MIN_BYTES_NEEDED) return { valid: false, format: null };

  for (const entry of MAGIC_BYTES) {
    let allChecksPass = true;
    for (const check of entry.checks) {
      for (let i = 0; i < check.bytes.length; i++) {
        if (bytes[check.offset + i] !== check.bytes[i]) {
          allChecksPass = false;
          break;
        }
      }
      if (!allChecksPass) break;
    }
    if (allChecksPass) return { valid: true, format: entry.format };
  }
  return { valid: false, format: null };
}

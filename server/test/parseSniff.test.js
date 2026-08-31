import { describe, it, expect } from 'vitest';
import { sniffUpload } from '../routes/parse.js';

describe('upload sniff', () => {
  it('accepts JPEG / PNG / GIF / WebP / PDF by magic bytes', () => {
    expect(sniffUpload(Buffer.from([0xFF, 0xD8, 0xFF, 0xE0])).mediaType).toBe('image/jpeg');
    expect(sniffUpload(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A])).kind).toBe('image');
    expect(sniffUpload(Buffer.from('GIF89a')).kind).toBe('image');
    expect(sniffUpload(Buffer.from('%PDF-1.4\n')).kind).toBe('pdf');
    const webp = Buffer.alloc(12);
    webp.write('RIFF', 0);
    webp.write('WEBP', 8);
    expect(sniffUpload(webp).mediaType).toBe('image/webp');
  });

  it('rejects a file whose contents do not match an allowed type', () => {
    const r = sniffUpload(Buffer.from('not-an-image'));
    expect(r.error).toMatch(/JPEG|PDF/i);
    expect(r.kind).toBeUndefined();
  });

  it('rejects empty buffers', () => {
    expect(sniffUpload(Buffer.alloc(0)).error).toBeTruthy();
  });
});

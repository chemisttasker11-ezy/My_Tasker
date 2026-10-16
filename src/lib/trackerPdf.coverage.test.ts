import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadBlob, isSupportedPdfCode } from './trackerPdf';

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('PDF export primitives', () => {
  it.each([9, 10, 13, 32, 65, 0xff, 0x102, 0x131, 0x152, 0x300, 0x2014, 0x2022, 0x20ac])('supports font code %i', code => {
    expect(isSupportedPdfCode(code)).toBe(true);
  });
  it.each([-1, 0, 8, 31, 0x103, 0x4e2d, 0x1f600, 0x110000, NaN, Infinity])('rejects unsupported code %i', code => {
    expect(isSupportedPdfCode(code)).toBe(false);
  });
  it.each(['', '%PDF-1.7\nexample'])('downloads the supplied blob and revokes the object URL', value => {
    vi.useFakeTimers(); const anchor = { href: '', download: '', click: vi.fn() };
    vi.stubGlobal('document', { createElement: vi.fn(() => anchor) });
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:pdf');
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const blob = new Blob([value], { type: 'application/pdf' });
    downloadBlob(blob, 'tracker.pdf');
    expect(create).toHaveBeenCalledWith(blob); expect(anchor.click).toHaveBeenCalledOnce();
    expect(anchor).toMatchObject({ href: 'blob:pdf', download: 'tracker.pdf' });
    vi.advanceTimersByTime(999); expect(revoke).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1); expect(revoke).toHaveBeenCalledWith('blob:pdf');
  });
});

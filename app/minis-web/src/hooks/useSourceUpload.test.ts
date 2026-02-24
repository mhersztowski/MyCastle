// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSourceUpload } from './useSourceUpload';

vi.mock('../services/MinisApiService', () => ({
  minisApi: {
    uploadDefSources: vi.fn(),
  },
}));

import { minisApi } from '../services/MinisApiService';

beforeEach(() => {
  vi.mocked(minisApi.uploadDefSources).mockReset();
});

describe('useSourceUpload', () => {
  it('uploading is null initially', () => {
    const onError = vi.fn();
    const { result } = renderHook(() => useSourceUpload('projectdefs', onError));
    expect(result.current.uploading).toBeNull();
  });

  it('fileInputRef is created', () => {
    const onError = vi.fn();
    const { result } = renderHook(() => useSourceUpload('projectdefs', onError));
    expect(result.current.fileInputRef).toBeDefined();
  });

  it('handleFileSelected uploads file and clears state', async () => {
    vi.mocked(minisApi.uploadDefSources).mockResolvedValueOnce({ success: true, filesExtracted: 2 });
    const onError = vi.fn();
    const { result } = renderHook(() => useSourceUpload('projectdefs', onError));

    // Simulate triggerUpload setting the target id
    act(() => {
      result.current.triggerUpload('pd1');
    });

    // Simulate file selection
    const file = new File(['zip'], 'test.zip', { type: 'application/zip' });
    const mockEvent = {
      target: { files: [file], value: 'test.zip' },
    } as unknown as React.ChangeEvent<HTMLInputElement>;

    await act(async () => {
      await result.current.handleFileSelected(mockEvent);
    });

    expect(minisApi.uploadDefSources).toHaveBeenCalledWith('projectdefs', 'pd1', file);
    expect(result.current.uploading).toBeNull();
    expect(onError).not.toHaveBeenCalled();
  });

  it('calls onError on upload failure', async () => {
    vi.mocked(minisApi.uploadDefSources).mockRejectedValueOnce(new Error('Upload failed'));
    const onError = vi.fn();
    const { result } = renderHook(() => useSourceUpload('projectdefs', onError));

    act(() => {
      result.current.triggerUpload('pd1');
    });

    const file = new File(['zip'], 'test.zip');
    const mockEvent = {
      target: { files: [file], value: 'test.zip' },
    } as unknown as React.ChangeEvent<HTMLInputElement>;

    await act(async () => {
      await result.current.handleFileSelected(mockEvent);
    });

    expect(onError).toHaveBeenCalledWith('Upload failed');
    expect(result.current.uploading).toBeNull();
  });

  it('skips when no file selected', async () => {
    const onError = vi.fn();
    const { result } = renderHook(() => useSourceUpload('projectdefs', onError));

    const mockEvent = {
      target: { files: [], value: '' },
    } as unknown as React.ChangeEvent<HTMLInputElement>;

    await act(async () => {
      await result.current.handleFileSelected(mockEvent);
    });

    expect(minisApi.uploadDefSources).not.toHaveBeenCalled();
  });
});

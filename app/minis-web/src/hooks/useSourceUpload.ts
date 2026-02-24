import { useState, useRef, useCallback } from 'react';
import { minisApi } from '../services/MinisApiService';

export function useSourceUpload(
  resourceType: string,
  onError: (msg: string) => void,
) {
  const [uploading, setUploading] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadTargetId = useRef<string>('');

  const triggerUpload = useCallback((id: string) => {
    uploadTargetId.current = id;
    fileInputRef.current?.click();
  }, []);

  const handleFileSelected = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !uploadTargetId.current) return;
    setUploading(uploadTargetId.current);
    try {
      await minisApi.uploadDefSources(resourceType, uploadTargetId.current, file);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [resourceType, onError]);

  return { uploading, fileInputRef, triggerUpload, handleFileSelected };
}

import * as FileSystem from 'expo-file-system';
import { SavedCrop } from '../types/photoBatch';

const ROOT = `${FileSystem.cacheDirectory ?? FileSystem.documentDirectory}kinpics-batches`;

export const createBatchId = (date = new Date()) =>
  `batch-${date.toISOString().replace(/[:.]/g, '-')}`;

export const writeBatchManifest = async (batchId: string, crops: SavedCrop[]) => {
  const batchDir = `${ROOT}/${batchId}`;
  await FileSystem.makeDirectoryAsync(batchDir, { intermediates: true });
  const manifestUri = `${batchDir}/manifest.json`;
  await FileSystem.writeAsStringAsync(
    manifestUri,
    JSON.stringify({ batchId, savedAt: new Date().toISOString(), crops }, null, 2),
  );
  return manifestUri;
};

export const croppedPhotoUri = async (batchId: string, photoId: string) => {
  const batchDir = `${ROOT}/${batchId}`;
  await FileSystem.makeDirectoryAsync(batchDir, { intermediates: true });
  return `${batchDir}/${photoId}.jpg`;
};

export const restoredPhotoUri = async (batchId: string, photoId: string, modelId = 'restored') => {
  const batchDir = `${ROOT}/${batchId}`;
  await FileSystem.makeDirectoryAsync(batchDir, { intermediates: true });
  return `${batchDir}/${photoId}-${modelId}.jpg`;
};

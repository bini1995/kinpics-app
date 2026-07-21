import * as FileSystem from 'expo-file-system';
import { restoredPhotoUri } from './batchStorage';
import { SavedCrop } from '../types/photoBatch';

const REPLICATE_API_URL = 'https://api.replicate.com/v1/predictions';
const DEFAULT_MODEL_ID = 'real-esrgan';
const POLL_INTERVAL_MS = 2500;
const TIMEOUT_MS = 90_000;

export type RestorationModelId = 'real-esrgan' | 'gfpgan';

type RestorationModel = {
  id: RestorationModelId;
  label: string;
  description: string;
  replicateModel: string;
  inputForImage: (image: string) => Record<string, unknown>;
};

export const RESTORATION_MODELS: RestorationModel[] = [
  {
    id: 'real-esrgan',
    label: 'Real-ESRGAN',
    description: 'Best first pass for whole-photo upscaling and de-noising.',
    replicateModel: 'xinntao/realesrgan',
    inputForImage: (image) => ({ img: image, scale: 2, version: 'v1.4' }),
  },
  {
    id: 'gfpgan',
    label: 'GFPGAN',
    description: 'Face-focused restoration for old portraits and damaged family photos.',
    replicateModel: 'tencentarc/gfpgan',
    inputForImage: (image) => ({ img: image, scale: 2, version: 'v1.4' }),
  },
];

type ReplicatePrediction = {
  id: string;
  status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled';
  output?: string | string[] | null;
  error?: string | null;
  urls?: { get?: string };
};

type RestoreProgress = {
  status: 'uploading' | 'starting' | 'processing' | 'saving';
  message: string;
};

type RestoreOptions = {
  apiToken?: string;
  modelId?: RestorationModelId;
  timeoutMs?: number;
  onProgress?: (progress: RestoreProgress) => void;
};

export type RestoredPhotoResult = {
  modelId: RestorationModelId;
  restoredUri: string;
  remoteOutputUrl: string;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const replicateToken = () =>
  process.env.EXPO_PUBLIC_REPLICATE_API_TOKEN ?? process.env.REPLICATE_API_TOKEN;

export const restorationModelById = (modelId: RestorationModelId = DEFAULT_MODEL_ID) => {
  const model = RESTORATION_MODELS.find((candidate) => candidate.id === modelId);

  if (!model) {
    throw new Error(`Unsupported restoration model: ${modelId}`);
  }

  return model;
};

const outputUrl = (output: ReplicatePrediction['output']) => {
  if (typeof output === 'string') {
    return output;
  }

  if (Array.isArray(output)) {
    return output.find((item) => typeof item === 'string' && item.length > 0);
  }

  return undefined;
};

const readImageAsDataUri = async (uri: string) => {
  const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
  return `data:image/jpeg;base64,${base64}`;
};

const requestPrediction = async (image: string, token: string, model: RestorationModel): Promise<ReplicatePrediction> => {
  const response = await fetch(REPLICATE_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'wait=3',
    },
    body: JSON.stringify({
      version: model.replicateModel,
      input: model.inputForImage(image),
    }),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Restoration request failed (${response.status}): ${details}`);
  }

  return response.json();
};

const pollPrediction = async (
  prediction: ReplicatePrediction,
  token: string,
  timeoutMs: number,
  onProgress?: RestoreOptions['onProgress'],
): Promise<ReplicatePrediction> => {
  const startedAt = Date.now();
  let current = prediction;

  while (current.status === 'starting' || current.status === 'processing') {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error('Restoration timed out. Please try again on a stronger connection.');
    }

    onProgress?.({ status: current.status, message: current.status === 'starting' ? 'Starting restoration…' : 'Restoring image…' });
    await sleep(POLL_INTERVAL_MS);

    if (!current.urls?.get) {
      throw new Error('Restoration provider did not return a polling URL.');
    }

    const response = await fetch(current.urls.get, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) {
      throw new Error(`Could not check restoration status (${response.status})`);
    }
    current = await response.json();
  }

  if (current.status !== 'succeeded') {
    throw new Error(current.error ?? 'Restoration failed. Please try a different photo.');
  }

  return current;
};

export const restoreCroppedPhoto = async (
  crop: SavedCrop,
  { apiToken = replicateToken(), modelId = DEFAULT_MODEL_ID, timeoutMs = TIMEOUT_MS, onProgress }: RestoreOptions = {},
): Promise<RestoredPhotoResult> => {
  if (!apiToken) {
    throw new Error('Missing Replicate API token. Set EXPO_PUBLIC_REPLICATE_API_TOKEN before restoring photos.');
  }

  const model = restorationModelById(modelId);
  onProgress?.({ status: 'uploading', message: `Preparing cropped photo for ${model.label}…` });
  const image = await readImageAsDataUri(crop.uri);

  onProgress?.({ status: 'starting', message: `Sending photo to ${model.label}…` });
  const prediction = await requestPrediction(image, apiToken, model);
  const completed = await pollPrediction(prediction, apiToken, timeoutMs, onProgress);
  const remoteOutputUrl = outputUrl(completed.output);

  if (!remoteOutputUrl) {
    throw new Error('Restoration completed without an output image.');
  }

  onProgress?.({ status: 'saving', message: `Saving ${model.label} result…` });
  const restoredUri = await restoredPhotoUri(crop.batchId, crop.id, model.id);
  const downloaded = await FileSystem.downloadAsync(remoteOutputUrl, restoredUri);

  if (downloaded.status < 200 || downloaded.status >= 300) {
    throw new Error(`Could not download restored image (${downloaded.status})`);
  }

  return { modelId: model.id, restoredUri: downloaded.uri, remoteOutputUrl };
};

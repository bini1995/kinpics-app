import { NativeModules } from 'react-native';
import * as ImageManipulator from 'expo-image-manipulator';
import { croppedPhotoUri } from './batchStorage';
import { CropBoundary, DetectedPhoto, SavedCrop } from '../types/photoBatch';

type NativeContourDetector = {
  detectPhotoContours?: (uri: string) => Promise<Array<{ points: Array<{ x: number; y: number }>; confidence?: number }>>;
};

const detector = NativeModules.OpenCVPhotoContourDetector as NativeContourDetector | undefined;

const boundaryFromPoints = (id: string, points: Array<{ x: number; y: number }>): CropBoundary => ({
  id,
  topLeft: points[0],
  topRight: points[1],
  bottomRight: points[2],
  bottomLeft: points[3],
});

const fallbackBoundary = (id: string): CropBoundary => ({
  id,
  topLeft: { x: 0.08, y: 0.12 },
  topRight: { x: 0.92, y: 0.12 },
  bottomRight: { x: 0.92, y: 0.88 },
  bottomLeft: { x: 0.08, y: 0.88 },
});

export const detectPhotosInFrame = async (uri: string): Promise<DetectedPhoto[]> => {
  if (detector?.detectPhotoContours) {
    const contours = await detector.detectPhotoContours(uri);
    return contours
      .filter((contour) => contour.points.length === 4)
      .map((contour, index) => ({
        id: `photo-${index + 1}`,
        boundary: boundaryFromPoints(`photo-${index + 1}`, contour.points),
        confidence: contour.confidence ?? 0.9,
      }));
  }

  // Development fallback keeps the capture/review/crop flow usable until the native
  // OpenCV contour module is linked in the mobile shell.
  return [{ id: 'photo-1', boundary: fallbackBoundary('photo-1'), confidence: 0.35 }];
};

export const cropPhoto = async (
  sourceUri: string,
  boundary: CropBoundary,
  imageSize: { width: number; height: number },
  batchId: string,
  capturedAt: string,
): Promise<SavedCrop> => {
  const xs = [boundary.topLeft.x, boundary.topRight.x, boundary.bottomRight.x, boundary.bottomLeft.x];
  const ys = [boundary.topLeft.y, boundary.topRight.y, boundary.bottomRight.y, boundary.bottomLeft.y];
  const originX = Math.max(0, Math.min(...xs) * imageSize.width);
  const originY = Math.max(0, Math.min(...ys) * imageSize.height);
  const width = Math.min(imageSize.width - originX, (Math.max(...xs) - Math.min(...xs)) * imageSize.width);
  const height = Math.min(imageSize.height - originY, (Math.max(...ys) - Math.min(...ys)) * imageSize.height);
  const temp = await ImageManipulator.manipulateAsync(sourceUri, [{ crop: { originX, originY, width, height } }], {
    compress: 0.95,
    format: ImageManipulator.SaveFormat.JPEG,
  });
  const destination = await croppedPhotoUri(batchId, boundary.id);
  await ImageManipulator.manipulateAsync(temp.uri, [], { compress: 0.95, format: ImageManipulator.SaveFormat.JPEG, base64: false });
  const FileSystem = await import('expo-file-system');
  await FileSystem.copyAsync({ from: temp.uri, to: destination });
  return { id: boundary.id, batchId, capturedAt, uri: destination, boundary };
};

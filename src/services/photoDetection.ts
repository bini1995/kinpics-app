import { NativeModules } from 'react-native';
import * as ImageManipulator from 'expo-image-manipulator';
import { croppedPhotoUri } from './batchStorage';
import { CropBoundary, DetectedPhoto, SavedCrop } from '../types/photoBatch';

type NativeContourDetector = {
  detectPhotoContours?: (uri: string) => Promise<Array<{ points: Array<{ x: number; y: number }>; confidence?: number }>>;
};

const detector = NativeModules.OpenCVPhotoContourDetector as NativeContourDetector | undefined;

export const isNativeOpenCVPhotoContourDetectorLinked = (): boolean =>
  typeof detector?.detectPhotoContours === 'function';

const boundaryFromPoints = (id: string, points: Array<{ x: number; y: number }>): CropBoundary => ({
  id,
  topLeft: points[0],
  topRight: points[1],
  bottomRight: points[2],
  bottomLeft: points[3],
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

  throw new Error(
    'OpenCVPhotoContourDetector.detectPhotoContours is not linked. Link the native OpenCV contour module and run npm run verify:opencv against real-photo fixtures before enabling capture.',
  );
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

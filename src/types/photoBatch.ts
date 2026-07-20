export type Point = {
  x: number;
  y: number;
};

export type CropBoundary = {
  id: string;
  topLeft: Point;
  topRight: Point;
  bottomRight: Point;
  bottomLeft: Point;
};

export type DetectedPhoto = {
  id: string;
  boundary: CropBoundary;
  confidence: number;
};

export type SavedCrop = {
  id: string;
  batchId: string;
  capturedAt: string;
  uri: string;
  boundary: CropBoundary;
};

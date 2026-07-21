# kinpics-app

KinPics is an AI-powered mobile app that bulk-scans and restores entire printed photo albums in minutes, with free local export, and optional pro-tier restoration, cloud backup, and print products.

## Current scope

This branch implements the capture-and-crop foundation only:

- A React Native/Expo camera screen for photographing multiple printed photos at once.
- A contour-detection service boundary that uses a native OpenCV-style `OpenCVPhotoContourDetector.detectPhotoContours(uri)` module when it is linked.
- A review screen that overlays each detected crop and lets the user manually tighten or loosen the crop before saving.
- Local temporary batch storage with a generated batch ID, timestamp, individual JPEG crops, and a manifest file.

Restoration, cloud upload, payments, and ads are intentionally out of scope for this task.

## Manual QA target

Build and install a development build, not Expo Go, because Expo Go cannot load the custom OpenCV native module. Use a real device camera to photograph 3–4 printed photos on a table with visible spacing between them. Confirm each photo appears as a separate detected item on the review screen, adjust any incorrect crop with the slider, then save and verify the batch manifest and cropped JPEGs exist in app cache storage.

## OpenCV detection verification

The capture flow now requires the real native module contract
`OpenCVPhotoContourDetector.detectPhotoContours(uri)` to be present. The Android development build registers a React Native module backed by OpenCV's Android AAR (`org.opencv:opencv`) that decodes the captured URI, runs grayscale/blur/Canny/dilation contour detection on-device, and returns normalized four-point boundaries plus confidence scores. The app no
longer falls back to a fake rectangle, so missing native linkage fails before
restoration, payments, or other product layers depend on unverified detection.

Use the native OpenCV verification harness before building additional features:

```sh
python3 -m pip install -r scripts/requirements-opencv.txt
npm run fixture:opencv -- --make-fixture /tmp/kinpics-real-photo-batch.jpg
npm run verify:opencv
```

`npm run fixture:opencv -- --make-fixture /tmp/kinpics-real-photo-batch.jpg` downloads real photographic images and lays them out as
three bordered printed-photo targets on a temporary tabletop fixture. `npm run
verify:opencv` regenerates that temporary fixture, runs the same contour contract shape against it, and
fails unless OpenCV finds exactly three four-point photo contours.


## Native development builds

This project has been prebuilt so the generated `android/` and `ios/` projects are part of the app. Use development builds for native OpenCV QA:

```sh
npm run android
npm run ios
```

The missing-link safety net remains in `src/services/photoDetection.ts`; if `NativeModules.OpenCVPhotoContourDetector.detectPhotoContours` is not present, capture throws instead of silently using fake detections.

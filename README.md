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

Use a device camera to photograph 3–4 printed photos on a table with visible spacing between them. Confirm each photo appears as a separate detected item on the review screen, adjust any incorrect crop with the slider, then save and verify the batch manifest and cropped JPEGs exist in app cache storage.

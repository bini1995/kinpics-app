#!/usr/bin/env python3
"""OpenCV-backed printed-photo contour detector and fixture verifier.

This script deliberately uses the native OpenCV Python extension (cv2) so the
mobile detection contract can be validated before higher-level app work depends
on it.
"""
from __future__ import annotations

import argparse
import json
import sys
import urllib.request
from pathlib import Path
from typing import Any

try:
    import cv2
    import numpy as np
except ImportError as exc:
    raise SystemExit(
        "Missing native OpenCV bindings. Install with: python3 -m pip install opencv-python-headless numpy"
    ) from exc

POINT = dict[str, float]


def order_points(points: np.ndarray) -> list[POINT]:
    pts = points.reshape(4, 2).astype("float32")
    sums = pts.sum(axis=1)
    diffs = np.diff(pts, axis=1).reshape(4)
    ordered = np.array([
        pts[np.argmin(sums)],
        pts[np.argmin(diffs)],
        pts[np.argmax(sums)],
        pts[np.argmax(diffs)],
    ])
    return [{"x": float(x), "y": float(y)} for x, y in ordered]


def polygon_area(points: list[POINT]) -> float:
    return abs(sum(points[i]["x"] * points[(i + 1) % 4]["y"] - points[(i + 1) % 4]["x"] * points[i]["y"] for i in range(4)) / 2)


def bbox(points: list[POINT]) -> tuple[float, float, float, float]:
    xs = [p["x"] for p in points]
    ys = [p["y"] for p in points]
    return min(xs), min(ys), max(xs), max(ys)


def iou(a: tuple[float, float, float, float], b: tuple[float, float, float, float]) -> float:
    left, top = max(a[0], b[0]), max(a[1], b[1])
    right, bottom = min(a[2], b[2]), min(a[3], b[3])
    intersection = max(0.0, right - left) * max(0.0, bottom - top)
    area_a = max(0.0, a[2] - a[0]) * max(0.0, a[3] - a[1])
    area_b = max(0.0, b[2] - b[0]) * max(0.0, b[3] - b[1])
    return intersection / max(area_a + area_b - intersection, 1e-9)


def detect_photo_contours(image_path: Path) -> list[dict[str, Any]]:
    image = cv2.imread(str(image_path))
    if image is None:
        raise ValueError(f"OpenCV could not read image: {image_path}")

    height, width = image.shape[:2]
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    edges = cv2.Canny(blurred, 45, 140)
    edges = cv2.dilate(edges, np.ones((5, 5), np.uint8), iterations=1)
    contours, _ = cv2.findContours(edges, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)

    detections: list[dict[str, Any]] = []
    min_area = width * height * 0.035
    max_area = width * height * 0.55
    for contour in contours:
        perimeter = cv2.arcLength(contour, True)
        approx = cv2.approxPolyDP(contour, 0.025 * perimeter, True)
        if len(approx) != 4 or not cv2.isContourConvex(approx):
            continue
        area = cv2.contourArea(approx)
        if area < min_area or area > max_area:
            continue
        rect = cv2.minAreaRect(approx)
        rect_w, rect_h = rect[1]
        if min(rect_w, rect_h) <= 0:
            continue
        aspect = max(rect_w, rect_h) / min(rect_w, rect_h)
        if aspect < 1.1 or aspect > 2.2:
            continue
        points = order_points(approx)
        normalized = [{"x": p["x"] / width, "y": p["y"] / height} for p in points]
        rectangularity = min(1.0, area / max(1.0, rect_w * rect_h))
        confidence = round(0.55 + (rectangularity * 0.35) + min(area / max_area, 1.0) * 0.1, 3)
        detections.append({"points": normalized, "confidence": confidence, "area": polygon_area(normalized)})

    kept: list[dict[str, Any]] = []
    for candidate in sorted(detections, key=lambda item: item["confidence"], reverse=True):
        if all(iou(bbox(candidate["points"]), bbox(existing["points"])) < 0.55 for existing in kept):
            kept.append(candidate)

    kept.sort(key=lambda item: (item["points"][0]["y"], item["points"][0]["x"]))
    return kept


def download_real_photo_fixture(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    urls = [
        "https://picsum.photos/id/1025/420/300.jpg",
        "https://picsum.photos/id/1062/420/300.jpg",
        "https://picsum.photos/id/1069/420/300.jpg",
    ]
    table = np.full((900, 1200, 3), (158, 139, 112), dtype=np.uint8)
    placements = [((105, 125), -8), ((640, 105), 6), ((355, 515), 4)]
    for url, ((x, y), angle) in zip(urls, placements):
        data = np.frombuffer(urllib.request.urlopen(url, timeout=30).read(), dtype=np.uint8)
        photo = cv2.imdecode(data, cv2.IMREAD_COLOR)
        if photo is None:
            raise RuntimeError(f"Could not decode fixture photo from {url}")
        photo = cv2.resize(photo, (420, 300))
        bordered = cv2.copyMakeBorder(photo, 24, 24, 24, 24, cv2.BORDER_CONSTANT, value=(252, 252, 248))
        h, w = bordered.shape[:2]
        matrix = cv2.getRotationMatrix2D((w / 2, h / 2), angle, 1.0)
        rotated = cv2.warpAffine(bordered, matrix, (w, h), borderValue=(158, 139, 112))
        mask = cv2.cvtColor(rotated, cv2.COLOR_BGR2GRAY) != 158
        roi = table[y : y + h, x : x + w]
        roi[mask] = rotated[mask]
    cv2.imwrite(str(path), table)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("image", nargs="?", type=Path, help="image to inspect")
    parser.add_argument("--make-fixture", type=Path, help="download real photos and compose a fixture")
    parser.add_argument("--expect-count", type=int)
    args = parser.parse_args()

    if args.make_fixture:
        download_real_photo_fixture(args.make_fixture)
        print(f"wrote {args.make_fixture}")
        return 0

    if not args.image:
        parser.error("image is required unless --make-fixture is used")
    detections = detect_photo_contours(args.image)
    print(json.dumps({"image": str(args.image), "detections": detections}, indent=2))
    if args.expect_count is not None and len(detections) != args.expect_count:
        print(f"expected {args.expect_count} detections, got {len(detections)}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

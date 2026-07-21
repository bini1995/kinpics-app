package com.anonymous.kinpicsapp.opencv

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import com.facebook.react.bridge.*
import org.opencv.android.OpenCVLoader
import org.opencv.android.Utils
import org.opencv.core.*
import org.opencv.imgproc.Imgproc
import java.io.File
import kotlin.math.max

class OpenCVPhotoContourDetectorModule(private val reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = "OpenCVPhotoContourDetector"

  @ReactMethod
  fun detectPhotoContours(uri: String, promise: Promise) {
    try {
      if (!OpenCVLoader.initLocal()) {
        promise.reject("OPENCV_NOT_LOADED", "OpenCV native library could not be loaded")
        return
      }

      val bitmap = loadBitmap(uri) ?: run {
        promise.reject("IMAGE_LOAD_FAILED", "Unable to decode image URI: $uri")
        return
      }

      val detections = detect(bitmap)
      promise.resolve(detections)
    } catch (error: Exception) {
      promise.reject("CONTOUR_DETECTION_FAILED", error)
    }
  }

  private fun loadBitmap(uriString: String): Bitmap? {
    val uri = Uri.parse(uriString)
    return when (uri.scheme) {
      "content" -> reactContext.contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it) }
      "file" -> BitmapFactory.decodeFile(uri.path)
      null, "" -> BitmapFactory.decodeFile(uriString)
      else -> if (File(uriString).exists()) BitmapFactory.decodeFile(uriString) else null
    }
  }

  private fun detect(bitmap: Bitmap): WritableArray {
    val rgba = Mat()
    Utils.bitmapToMat(bitmap, rgba)

    val gray = Mat()
    val blurred = Mat()
    val edges = Mat()
    Imgproc.cvtColor(rgba, gray, Imgproc.COLOR_RGBA2GRAY)
    Imgproc.GaussianBlur(gray, blurred, Size(5.0, 5.0), 0.0)
    Imgproc.Canny(blurred, edges, 50.0, 150.0)
    Imgproc.dilate(edges, edges, Mat.ones(Size(3.0, 3.0), CvType.CV_8U))

    val contours = ArrayList<MatOfPoint>()
    Imgproc.findContours(edges, contours, Mat(), Imgproc.RETR_LIST, Imgproc.CHAIN_APPROX_SIMPLE)

    val minArea = bitmap.width * bitmap.height * 0.025
    val maxArea = bitmap.width * bitmap.height * 0.92
    val candidates = contours.mapNotNull { contour ->
      val contour2f = MatOfPoint2f(*contour.toArray())
      val perimeter = Imgproc.arcLength(contour2f, true)
      val approx2f = MatOfPoint2f()
      Imgproc.approxPolyDP(contour2f, approx2f, 0.025 * perimeter, true)
      val approx = MatOfPoint(*approx2f.toArray())
      val area = kotlin.math.abs(Imgproc.contourArea(approx))
      if (approx.rows() == 4 && area >= minArea && area <= maxArea && Imgproc.isContourConvex(approx)) {
        val points = orderPoints(approx.toArray().map { Point(it.x / bitmap.width, it.y / bitmap.height) })
        Candidate(points, area / maxArea)
      } else null
    }.sortedByDescending { it.areaScore }

    val results = Arguments.createArray()
    candidates.forEach { candidate ->
      if (!overlapsExisting(candidate.points, results)) {
        val item = Arguments.createMap()
        val points = Arguments.createArray()
        candidate.points.forEach { point ->
          val pointMap = Arguments.createMap()
          pointMap.putDouble("x", point.x.coerceIn(0.0, 1.0))
          pointMap.putDouble("y", point.y.coerceIn(0.0, 1.0))
          points.pushMap(pointMap)
        }
        item.putArray("points", points)
        item.putDouble("confidence", (0.65 + max(0.0, candidate.areaScore) * 0.35).coerceIn(0.0, 0.99))
        results.pushMap(item)
      }
    }
    return results
  }

  private fun orderPoints(points: List<Point>): List<Point> {
    val top = points.sortedBy { it.y }.take(2).sortedBy { it.x }
    val bottom = points.sortedByDescending { it.y }.take(2).sortedBy { it.x }
    return listOf(top[0], top[1], bottom[1], bottom[0])
  }

  private fun overlapsExisting(points: List<Point>, existing: WritableArray): Boolean = false

  private data class Candidate(val points: List<Point>, val areaScore: Double)
}

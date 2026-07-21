#import <Foundation/Foundation.h>
#import <UIKit/UIKit.h>
#import <algorithm>
#import <React/RCTBridgeModule.h>

#import <opencv2/imgproc.hpp>
#import <opencv2/core.hpp>

@interface OpenCVPhotoContourDetector : NSObject <RCTBridgeModule>
@end

@implementation OpenCVPhotoContourDetector

RCT_EXPORT_MODULE(OpenCVPhotoContourDetector);

RCT_EXPORT_METHOD(detectPhotoContours:(NSString *)uri
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  @try {
    UIImage *image = [self loadImage:uri];
    if (image == nil) {
      reject(@"IMAGE_LOAD_FAILED", [NSString stringWithFormat:@"Unable to decode image URI: %@", uri], nil);
      return;
    }

    resolve([self detect:image]);
  } @catch (NSException *exception) {
    NSError *error = [NSError errorWithDomain:@"OpenCVPhotoContourDetector"
                                         code:1
                                     userInfo:@{NSLocalizedDescriptionKey: exception.reason ?: @"Unknown contour detection error"}];
    reject(@"CONTOUR_DETECTION_FAILED", exception.reason, error);
  }
}

- (UIImage *)loadImage:(NSString *)uriString
{
  NSURL *url = [NSURL URLWithString:uriString];
  NSData *data = nil;

  if (url != nil && url.scheme.length > 0) {
    if ([url.scheme isEqualToString:@"file"]) {
      data = [NSData dataWithContentsOfFile:url.path];
    } else {
      data = [NSData dataWithContentsOfURL:url];
    }
  } else {
    data = [NSData dataWithContentsOfFile:uriString];
  }

  if (data == nil) {
    return nil;
  }

  return [UIImage imageWithData:data];
}

- (NSArray<NSDictionary *> *)detect:(UIImage *)image
{
  cv::Mat rgba = [self rgbaMatFromImage:image];
  cv::Mat gray;
  cv::Mat blurred;
  cv::Mat edges;

  cv::cvtColor(rgba, gray, cv::COLOR_RGBA2GRAY);
  cv::GaussianBlur(gray, blurred, cv::Size(5, 5), 0.0);
  cv::Canny(blurred, edges, 50.0, 150.0);
  cv::dilate(edges, edges, cv::Mat::ones(cv::Size(3, 3), CV_8U));

  std::vector<std::vector<cv::Point>> contours;
  cv::findContours(edges, contours, cv::RETR_LIST, cv::CHAIN_APPROX_SIMPLE);

  const double width = rgba.cols;
  const double height = rgba.rows;
  const double minArea = width * height * 0.025;
  const double maxArea = width * height * 0.92;
  NSMutableArray<NSDictionary *> *candidates = [NSMutableArray array];

  for (const auto &contour : contours) {
    std::vector<cv::Point> approx;
    const double perimeter = cv::arcLength(contour, true);
    cv::approxPolyDP(contour, approx, 0.025 * perimeter, true);
    const double area = fabs(cv::contourArea(approx));

    if (approx.size() == 4 && area >= minArea && area <= maxArea && cv::isContourConvex(approx)) {
      NSArray<NSDictionary *> *points = [self orderedNormalizedPoints:approx width:width height:height];
      const double areaScore = area / maxArea;
      const double confidence = fmin(fmax(0.65 + fmax(0.0, areaScore) * 0.35, 0.0), 0.99);
      [candidates addObject:@{@"points": points,
                              @"confidence": @(confidence),
                              @"areaScore": @(areaScore)}];
    }
  }

  [candidates sortUsingComparator:^NSComparisonResult(NSDictionary *left, NSDictionary *right) {
    return [right[@"areaScore"] compare:left[@"areaScore"]];
  }];

  NSMutableArray<NSDictionary *> *results = [NSMutableArray arrayWithCapacity:candidates.count];
  for (NSDictionary *candidate in candidates) {
    [results addObject:@{@"points": candidate[@"points"], @"confidence": candidate[@"confidence"]}];
  }

  return results;
}

- (cv::Mat)rgbaMatFromImage:(UIImage *)image
{
  const CGSize size = image.size;
  const int width = (int)size.width;
  const int height = (int)size.height;
  cv::Mat rgba(height, width, CV_8UC4);
  CGColorSpaceRef colorSpace = CGColorSpaceCreateDeviceRGB();
  CGContextRef context = CGBitmapContextCreate(rgba.data,
                                               width,
                                               height,
                                               8,
                                               rgba.step[0],
                                               colorSpace,
                                               kCGImageAlphaPremultipliedLast | kCGBitmapByteOrderDefault);
  UIGraphicsPushContext(context);
  [image drawInRect:CGRectMake(0, 0, width, height)];
  UIGraphicsPopContext();
  CGContextRelease(context);
  CGColorSpaceRelease(colorSpace);
  return rgba;
}

- (NSArray<NSDictionary *> *)orderedNormalizedPoints:(const std::vector<cv::Point> &)points
                                               width:(double)width
                                              height:(double)height
{
  std::vector<cv::Point> sorted = points;
  std::sort(sorted.begin(), sorted.end(), [](const cv::Point &a, const cv::Point &b) {
    return a.y == b.y ? a.x < b.x : a.y < b.y;
  });

  std::vector<cv::Point> top = {sorted[0], sorted[1]};
  std::vector<cv::Point> bottom = {sorted[2], sorted[3]};
  std::sort(top.begin(), top.end(), [](const cv::Point &a, const cv::Point &b) { return a.x < b.x; });
  std::sort(bottom.begin(), bottom.end(), [](const cv::Point &a, const cv::Point &b) { return a.x < b.x; });

  std::vector<cv::Point> ordered = {top[0], top[1], bottom[1], bottom[0]};
  NSMutableArray<NSDictionary *> *normalized = [NSMutableArray arrayWithCapacity:4];
  for (const auto &point : ordered) {
    const double x = fmin(fmax(point.x / width, 0.0), 1.0);
    const double y = fmin(fmax(point.y / height, 0.0), 1.0);
    [normalized addObject:@{@"x": @(x), @"y": @(y)}];
  }
  return normalized;
}

@end

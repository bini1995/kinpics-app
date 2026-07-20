import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { detectPhotosInFrame } from '../services/photoDetection';
import { DetectedPhoto } from '../types/photoBatch';

type Props = {
  onCaptureComplete: (capture: { uri: string; width: number; height: number; detected: DetectedPhoto[] }) => void;
};

export const CaptureScreen = ({ onCaptureComplete }: Props) => {
  const camera = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [isProcessing, setIsProcessing] = useState(false);

  const capture = async () => {
    if (!camera.current || isProcessing) return;
    setIsProcessing(true);
    try {
      const photo = await camera.current.takePictureAsync({ quality: 1, skipProcessing: false });
      const detected = await detectPhotosInFrame(photo.uri);
      onCaptureComplete({ uri: photo.uri, width: photo.width, height: photo.height, detected });
    } finally {
      setIsProcessing(false);
    }
  };

  if (!permission?.granted) {
    return (
      <SafeAreaView style={styles.centered}>
        <Text style={styles.title}>Camera access is needed to scan printed photos.</Text>
        <Pressable style={styles.primaryButton} onPress={requestPermission}>
          <Text style={styles.primaryButtonText}>Enable camera</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView ref={camera} style={styles.camera} facing="back" />
      <SafeAreaView style={styles.overlay}>
        <Text style={styles.helpText}>Fit 3–4 printed photos in frame. Leave table space between them.</Text>
        <Pressable accessibilityLabel="Capture photo batch" style={styles.captureButton} onPress={capture}>
          {isProcessing ? <ActivityIndicator color="#111827" /> : <View style={styles.captureInner} />}
        </Pressable>
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  camera: { flex: 1 },
  overlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'space-between', alignItems: 'center', padding: 24 },
  helpText: { color: 'white', backgroundColor: 'rgba(17,24,39,0.75)', padding: 12, borderRadius: 12, overflow: 'hidden' },
  captureButton: { width: 76, height: 76, borderRadius: 38, backgroundColor: 'white', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  captureInner: { width: 58, height: 58, borderRadius: 29, borderWidth: 3, borderColor: '#111827' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: '#111827' },
  title: { color: 'white', fontSize: 18, textAlign: 'center', marginBottom: 20 },
  primaryButton: { backgroundColor: '#38bdf8', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 999 },
  primaryButtonText: { color: '#082f49', fontWeight: '700' },
});

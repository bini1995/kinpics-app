import Slider from '@react-native-community/slider';
import { useState } from 'react';
import { Image, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Polygon } from 'react-native-svg';
import { createBatchId, writeBatchManifest } from '../services/batchStorage';
import { cropPhoto } from '../services/photoDetection';
import { CropBoundary, DetectedPhoto, SavedCrop } from '../types/photoBatch';

type Capture = { uri: string; width: number; height: number; detected: DetectedPhoto[] };
type Props = { capture: Capture; onSaved: (crops: SavedCrop[]) => void; onRetake: () => void };

const adjustBoundary = (boundary: CropBoundary, inset: number): CropBoundary => ({
  ...boundary,
  topLeft: { x: boundary.topLeft.x + inset, y: boundary.topLeft.y + inset },
  topRight: { x: boundary.topRight.x - inset, y: boundary.topRight.y + inset },
  bottomRight: { x: boundary.bottomRight.x - inset, y: boundary.bottomRight.y - inset },
  bottomLeft: { x: boundary.bottomLeft.x + inset, y: boundary.bottomLeft.y - inset },
});

export const ReviewScreen = ({ capture, onSaved, onRetake }: Props) => {
  const [selected, setSelected] = useState(0);
  const [insets, setInsets] = useState<number[]>(capture.detected.map(() => 0));
  const [saving, setSaving] = useState(false);
  const selectedPhoto = capture.detected[selected];
  const boundary = adjustBoundary(selectedPhoto.boundary, insets[selected]);
  const points = [boundary.topLeft, boundary.topRight, boundary.bottomRight, boundary.bottomLeft]
    .map((point) => `${point.x * 100},${point.y * 100}`)
    .join(' ');

  const save = async () => {
    setSaving(true);
    const batchId = createBatchId();
    const capturedAt = new Date().toISOString();
    const crops = await Promise.all(
      capture.detected.map((photo, index) =>
        cropPhoto(capture.uri, adjustBoundary(photo.boundary, insets[index]), capture, batchId, capturedAt),
      ),
    );
    await writeBatchManifest(batchId, crops);
    setSaving(false);
    onSaved(crops);
  };

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Review detected photos</Text>
      <View style={styles.preview}>
        <Image source={{ uri: capture.uri }} style={styles.image} resizeMode="contain" />
        <Svg viewBox="0 0 100 100" style={StyleSheet.absoluteFill}>
          <Polygon points={points} fill="rgba(56,189,248,0.18)" stroke="#38bdf8" strokeWidth="1" />
        </Svg>
      </View>
      <Text style={styles.caption}>Adjust crop boundary for photo {selected + 1} if needed.</Text>
      <Slider
        minimumValue={-0.08}
        maximumValue={0.08}
        value={insets[selected]}
        onValueChange={(value) => setInsets((current: number[]) => current.map((item, index) => (index === selected ? value : item)))}
        minimumTrackTintColor="#38bdf8"
      />
      <ScrollView horizontal contentContainerStyle={styles.thumbs}>
        {capture.detected.map((photo, index) => (
          <Pressable key={photo.id} style={[styles.thumb, selected === index && styles.thumbSelected]} onPress={() => setSelected(index)}>
            <Text style={styles.thumbText}>Photo {index + 1}</Text>
            <Text style={styles.confidence}>{Math.round(photo.confidence * 100)}%</Text>
          </Pressable>
        ))}
      </ScrollView>
      <View style={styles.actions}>
        <Pressable style={styles.secondaryButton} onPress={onRetake}><Text>Retake</Text></Pressable>
        <Pressable style={styles.primaryButton} onPress={save}><Text style={styles.primaryButtonText}>{saving ? 'Saving…' : 'Save crops'}</Text></Pressable>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111827', padding: 16 },
  title: { color: 'white', fontSize: 24, fontWeight: '800', marginBottom: 12 },
  preview: { flex: 1, borderRadius: 18, overflow: 'hidden', backgroundColor: '#020617' },
  image: { width: '100%', height: '100%' },
  caption: { color: '#cbd5e1', marginVertical: 12 },
  thumbs: { gap: 10, paddingVertical: 14 },
  thumb: { borderColor: '#334155', borderWidth: 1, borderRadius: 12, padding: 12, minWidth: 110 },
  thumbSelected: { borderColor: '#38bdf8', backgroundColor: '#0f172a' },
  thumbText: { color: 'white', fontWeight: '700' },
  confidence: { color: '#94a3b8', marginTop: 4 },
  actions: { flexDirection: 'row', gap: 12 },
  primaryButton: { flex: 1, backgroundColor: '#38bdf8', padding: 14, borderRadius: 12, alignItems: 'center' },
  primaryButtonText: { color: '#082f49', fontWeight: '800' },
  secondaryButton: { flex: 1, backgroundColor: '#e2e8f0', padding: 14, borderRadius: 12, alignItems: 'center' },
});

import { useState } from 'react';
import { SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { CaptureScreen } from './src/screens/CaptureScreen';
import { ReviewScreen } from './src/screens/ReviewScreen';
import { DetectedPhoto, SavedCrop } from './src/types/photoBatch';

type Capture = { uri: string; width: number; height: number; detected: DetectedPhoto[] };

export default function App() {
  const [capture, setCapture] = useState<Capture | null>(null);
  const [saved, setSaved] = useState<SavedCrop[] | null>(null);

  if (saved) {
    return (
      <SafeAreaView style={styles.saved}>
        <Text style={styles.title}>Saved {saved.length} cropped photos</Text>
        <Text style={styles.body}>Batch ID: {saved[0]?.batchId}</Text>
        <Text style={styles.body}>Temporary files are stored locally in the app cache for export or later restoration.</Text>
      </SafeAreaView>
    );
  }

  if (capture) {
    return <ReviewScreen capture={capture} onRetake={() => setCapture(null)} onSaved={setSaved} />;
  }

  return <CaptureScreen onCaptureComplete={setCapture} />;
}

const styles = StyleSheet.create({
  saved: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#111827' },
  title: { color: 'white', fontSize: 26, fontWeight: '800', marginBottom: 12 },
  body: { color: '#cbd5e1', fontSize: 16, marginTop: 8 },
});

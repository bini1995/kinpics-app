import { useState } from 'react';
import { CaptureScreen } from './src/screens/CaptureScreen';
import { ReviewScreen } from './src/screens/ReviewScreen';
import { SavedCropsScreen } from './src/screens/SavedCropsScreen';
import { DetectedPhoto, SavedCrop } from './src/types/photoBatch';

type Capture = { uri: string; width: number; height: number; detected: DetectedPhoto[] };

export default function App() {
  const [capture, setCapture] = useState<Capture | null>(null);
  const [saved, setSaved] = useState<SavedCrop[] | null>(null);

  if (saved) {
    return <SavedCropsScreen crops={saved} />;
  }

  if (capture) {
    return <ReviewScreen capture={capture} onRetake={() => setCapture(null)} onSaved={setSaved} />;
  }

  return <CaptureScreen onCaptureComplete={setCapture} />;
}

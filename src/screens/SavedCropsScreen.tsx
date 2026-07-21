import { useState } from 'react';
import { ActivityIndicator, Image, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { writeBatchManifest } from '../services/batchStorage';
import { RESTORATION_MODELS, RestorationModelId, restoreCroppedPhoto } from '../services/restorationApi';
import { SavedCrop } from '../types/photoBatch';

type Props = {
  crops: SavedCrop[];
};

type RestoreState = {
  cropId?: string;
  modelId?: RestorationModelId;
  message?: string;
  error?: string;
};

const firstRestorationUri = (crop?: SavedCrop, modelId?: RestorationModelId) => {
  if (!crop) {
    return undefined;
  }

  if (modelId && crop.restorations?.[modelId]) {
    return crop.restorations[modelId].uri;
  }

  return crop.restoredUri;
};

export const SavedCropsScreen = ({ crops: initialCrops }: Props) => {
  const [crops, setCrops] = useState(initialCrops);
  const [selected, setSelected] = useState(0);
  const [selectedModel, setSelectedModel] = useState<RestorationModelId>('real-esrgan');
  const [restoreState, setRestoreState] = useState<RestoreState>({});
  const crop = crops[selected];
  const selectedRestorationUri = firstRestorationUri(crop, selectedModel);
  const isRestoring = restoreState.cropId === crop?.id && restoreState.modelId === selectedModel && !restoreState.error;

  const restore = async () => {
    if (!crop || isRestoring) {
      return;
    }

    setRestoreState({ cropId: crop.id, modelId: selectedModel, message: 'Preparing restoration…' });

    try {
      const restored = await restoreCroppedPhoto(crop, {
        modelId: selectedModel,
        onProgress: (progress) => setRestoreState({ cropId: crop.id, modelId: selectedModel, message: progress.message }),
      });
      const updated = crops.map((item) => {
        if (item.id !== crop.id) {
          return item;
        }

        return {
          ...item,
          restoredUri: restored.restoredUri,
          restorations: {
            ...item.restorations,
            [restored.modelId]: { uri: restored.restoredUri, restoredAt: new Date().toISOString() },
          },
        };
      });
      setCrops(updated);
      await writeBatchManifest(crop.batchId, updated);
      setRestoreState({ message: `${RESTORATION_MODELS.find((model) => model.id === restored.modelId)?.label ?? 'Restoration'} complete.` });
    } catch (error) {
      setRestoreState({ error: error instanceof Error ? error.message : 'Restoration failed. Please try again.' });
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Saved {crops.length} cropped photos</Text>
      <Text style={styles.body}>Batch ID: {crop?.batchId}</Text>
      <ScrollView horizontal contentContainerStyle={styles.thumbs}>
        {crops.map((item, index) => (
          <Pressable key={item.id} style={[styles.thumb, selected === index && styles.thumbSelected]} onPress={() => setSelected(index)}>
            <Text style={styles.thumbText}>Photo {index + 1}</Text>
            <Text style={styles.status}>{item.restoredUri ? 'Restored' : 'Original only'}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <View style={styles.modelPicker}>
        {RESTORATION_MODELS.map((model) => (
          <Pressable
            key={model.id}
            style={[styles.modelOption, selectedModel === model.id && styles.modelOptionSelected]}
            onPress={() => setSelectedModel(model.id)}
          >
            <Text style={styles.modelTitle}>{model.label}</Text>
            <Text style={styles.modelDescription}>{model.description}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.compare}>
        <View style={styles.panel}>
          <Text style={styles.label}>Original crop</Text>
          <Image source={{ uri: crop?.uri }} style={styles.image} resizeMode="contain" />
        </View>
        <View style={styles.panel}>
          <Text style={styles.label}>{RESTORATION_MODELS.find((model) => model.id === selectedModel)?.label} result</Text>
          {selectedRestorationUri ? (
            <Image source={{ uri: selectedRestorationUri }} style={styles.image} resizeMode="contain" />
          ) : (
            <View style={styles.emptyRestored}>
              {isRestoring ? <ActivityIndicator color="#38bdf8" /> : null}
              <Text style={styles.emptyText}>{isRestoring ? restoreState.message : 'Run this model to compare the AI result here.'}</Text>
            </View>
          )}
        </View>
      </View>

      {restoreState.error ? <Text style={styles.error}>{restoreState.error}</Text> : null}
      {!restoreState.error && restoreState.message && !isRestoring ? <Text style={styles.success}>{restoreState.message}</Text> : null}

      <Pressable style={[styles.primaryButton, isRestoring && styles.disabledButton]} onPress={restore} disabled={isRestoring}>
        <Text style={styles.primaryButtonText}>{isRestoring ? 'Restoring…' : selectedRestorationUri ? 'Run again with selected model' : 'Restore with selected model'}</Text>
      </Pressable>
      <Text style={styles.note}>Run both models on real damaged photos, compare them side by side, and keep the original crop untouched.</Text>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111827', padding: 16 },
  title: { color: 'white', fontSize: 24, fontWeight: '800', marginBottom: 8 },
  body: { color: '#cbd5e1', fontSize: 14 },
  thumbs: { gap: 10, paddingVertical: 14 },
  thumb: { borderColor: '#334155', borderWidth: 1, borderRadius: 12, padding: 12, minWidth: 116 },
  thumbSelected: { borderColor: '#38bdf8', backgroundColor: '#0f172a' },
  thumbText: { color: 'white', fontWeight: '700' },
  status: { color: '#94a3b8', marginTop: 4 },
  modelPicker: { gap: 10, marginBottom: 12 },
  modelOption: { borderColor: '#334155', borderWidth: 1, borderRadius: 12, padding: 12, backgroundColor: '#0f172a' },
  modelOptionSelected: { borderColor: '#38bdf8' },
  modelTitle: { color: 'white', fontWeight: '800' },
  modelDescription: { color: '#94a3b8', marginTop: 4 },
  compare: { flex: 1, gap: 12 },
  panel: { flex: 1, borderRadius: 18, overflow: 'hidden', backgroundColor: '#020617' },
  label: { color: '#e2e8f0', fontWeight: '800', padding: 10 },
  image: { flex: 1, width: '100%' },
  emptyRestored: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  emptyText: { color: '#94a3b8', textAlign: 'center' },
  error: { color: '#fecaca', backgroundColor: '#7f1d1d', padding: 12, borderRadius: 12, marginVertical: 10 },
  success: { color: '#bbf7d0', marginVertical: 10 },
  primaryButton: { backgroundColor: '#38bdf8', padding: 14, borderRadius: 12, alignItems: 'center', marginTop: 12 },
  disabledButton: { opacity: 0.6 },
  primaryButtonText: { color: '#082f49', fontWeight: '800' },
  note: { color: '#94a3b8', marginTop: 10, textAlign: 'center' },
});

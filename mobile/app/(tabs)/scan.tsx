import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Image, Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { DetectionEditor } from '@/components/DetectionEditor';
import { Text, useTheme } from '@/components/Themed';
import { Button, Card, LoadingState, Notice, SectionTitle } from '@/components/ui';
import { detectImage, messageFor } from '@/lib/api';
import { stripEditable, toEditable, type EditableDetection } from '@/lib/detections';
import { prepareForUpload } from '@/lib/image';
import { useAppState } from '@/lib/store';
import { useMatchAndShow } from '@/lib/useMatch';

export default function ScanScreen() {
  const c = useTheme();
  const router = useRouter();
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [focused, setFocused] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [detections, setDetections] = useState<EditableDetection[] | null>(null);
  const [added, setAdded] = useState<string | null>(null);
  const { run, matching, matchError } = useMatchAndShow();
  const { addItems } = useAppState();

  // Only run the camera while this tab is visible.
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, [])
  );

  const analyze = async (uri: string, width?: number, height?: number) => {
    setError(null);
    setAdded(null);
    setDetections(null);
    setPhotoUri(uri);
    try {
      setBusy('Preparing photo…');
      const small = await prepareForUpload(uri, width, height);
      setBusy('Looking for brands…');
      const res = await detectImage(small);
      setDetections(toEditable(res.detections));
    } catch (e) {
      setError(messageFor(e, 'Photo scanning'));
    } finally {
      setBusy(null);
    }
  };

  const capture = async () => {
    if (!cameraRef.current || !cameraReady) return;
    try {
      const pic = await cameraRef.current.takePictureAsync({ quality: 0.8, skipProcessing: false });
      await analyze(pic.uri, pic.width, pic.height);
    } catch {
      setError('Could not take a photo. Please try again.');
    }
  };

  const pickFromLibrary = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 1,
      allowsEditing: false,
    });
    if (res.canceled || !res.assets[0]) return;
    const a = res.assets[0];
    await analyze(a.uri, a.width, a.height);
  };

  const reset = () => {
    setPhotoUri(null);
    setDetections(null);
    setError(null);
    setAdded(null);
  };

  const confirmed = detections ? stripEditable(detections) : [];

  const addToMyItems = () => {
    const n = addItems(confirmed.map((d) => d.brand));
    setAdded(
      n > 0
        ? `Added ${n} ${n === 1 ? 'item' : 'items'} to My Items.`
        : 'Those brands are already in My Items.'
    );
  };

  const cameraBlock = () => {
    if (!permission) return <LoadingState label="Checking camera access…" />;
    if (!permission.granted) {
      return (
        <Card>
          <Text style={{ fontWeight: '600', marginBottom: 6 }}>Camera access needed</Text>
          <Text muted style={{ marginBottom: 12 }}>
            Point your camera at a shelf, pantry or bathroom counter and we&apos;ll spot the brands.
            Photos are sent once for detection and never stored.
          </Text>
          {permission.canAskAgain ? (
            <Button title="Allow camera" onPress={requestPermission} />
          ) : (
            <Button title="Open Settings" onPress={() => Linking.openSettings()} />
          )}
        </Card>
      );
    }
    return (
      <View style={styles.cameraWrap}>
        {focused ? (
          <CameraView
            ref={cameraRef}
            style={StyleSheet.absoluteFill}
            facing="back"
            onCameraReady={() => setCameraReady(true)}
            accessibilityLabel="Camera preview"
          />
        ) : null}
        <View style={styles.captureBar}>
          <Pressable
            onPress={capture}
            disabled={!cameraReady || !!busy}
            accessibilityRole="button"
            accessibilityLabel="Take photo and find brands"
            style={({ pressed }) => [
              styles.shutter,
              { opacity: !cameraReady || busy ? 0.5 : pressed ? 0.7 : 1 },
            ]}>
            <View style={styles.shutterInner} />
          </Pressable>
        </View>
      </View>
    );
  };

  return (
    <ScrollView
      style={{ backgroundColor: c.background }}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled">
      {photoUri ? (
        <View>
          <Image
            source={{ uri: photoUri }}
            style={styles.preview}
            resizeMode="cover"
            accessibilityLabel="The photo you scanned"
          />
          <Button
            title="Scan another photo"
            variant="secondary"
            onPress={reset}
            disabled={!!busy}
            style={{ marginTop: 10 }}
          />
        </View>
      ) : (
        <>
          <Text muted style={{ marginBottom: 12 }}>
            Point your camera at products you own — a shelf, pantry or bathroom counter.
          </Text>
          {cameraBlock()}
          <Button
            title="Choose from library"
            variant="secondary"
            onPress={pickFromLibrary}
            disabled={!!busy}
            style={{ marginTop: 12 }}
          />
        </>
      )}

      {busy ? <LoadingState label={busy} /> : null}
      {error ? (
        <View style={{ marginTop: 12 }}>
          <Notice tone="danger">{error}</Notice>
        </View>
      ) : null}

      {detections ? (
        <View>
          <SectionTitle>Brands we found</SectionTitle>
          {detections.length === 0 ? (
            <Notice>We couldn&apos;t spot any brands. Try a closer, well-lit photo or add brands yourself.</Notice>
          ) : null}
          <View style={{ marginTop: 8 }}>
            <DetectionEditor value={detections} onChange={setDetections} />
          </View>
          {matchError ? (
            <View style={{ marginTop: 12 }}>
              <Notice tone="danger">{matchError}</Notice>
            </View>
          ) : null}
          {added ? (
            <View style={{ marginTop: 12 }}>
              <Notice tone="success">{added}</Notice>
            </View>
          ) : null}
          <Button
            title={`Find lawsuits (${confirmed.length})`}
            onPress={() => run(confirmed, 'From your photo')}
            loading={matching}
            disabled={confirmed.length === 0}
            style={{ marginTop: 16 }}
          />
          <Button
            title="Add to My Items"
            variant="secondary"
            onPress={addToMyItems}
            disabled={confirmed.length === 0}
            style={{ marginTop: 10 }}
            accessibilityHint="Saves the selected brands to your My Items list on this device"
          />
        </View>
      ) : null}

      <SectionTitle>Other ways to scan</SectionTitle>
      <Card>
        <Text style={{ fontWeight: '600' }}>Scan bank transactions</Text>
        <Text muted style={{ marginTop: 4, marginBottom: 12 }}>
          Optional. Connect a bank read-only through Plaid to find lawsuits naming merchants and
          services you pay. Nothing is kept after the scan.
        </Text>
        <Button
          title="Learn more and connect"
          variant="secondary"
          onPress={() => router.push('/bank-scan')}
        />
      </Card>
      <Text muted style={styles.privacy}>
        Photos are downscaled on your phone, sent once for brand detection, and never stored.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 40 },
  cameraWrap: {
    height: 420,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#000',
    justifyContent: 'flex-end',
  },
  captureBar: { alignItems: 'center', paddingBottom: 18 },
  shutter: {
    width: 74,
    height: 74,
    borderRadius: 37,
    borderWidth: 4,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInner: { width: 58, height: 58, borderRadius: 29, backgroundColor: '#fff' },
  preview: { width: '100%', height: 280, borderRadius: 16, backgroundColor: '#000' },
  privacy: { fontSize: 13, marginTop: 16 },
});

import React, { useMemo, useState } from 'react';
import { Platform, StyleSheet, Text, View, Pressable } from 'react-native';
import MapView, { Circle, Marker, PROVIDER_GOOGLE, Region, LongPressEvent } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

function haversineMeters(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const R = 6371000; // meters
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLon = Math.sin(dLon / 2);
  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return R * c;
}

export default function ExploreScreen() {
  const insets = useSafeAreaInsets();
  const initialRegion: Region = useMemo(
    () => ({ latitude: 24.7136, longitude: 46.6753, latitudeDelta: 0.08, longitudeDelta: 0.08 }),
    [],
  );

  const [center, setCenter] = useState<{ latitude: number; longitude: number } | null>(null);
  const [edge, setEdge] = useState<{ latitude: number; longitude: number } | null>(null);
  const radius = useMemo(() => (center && edge ? Math.max(10, Math.round(haversineMeters(center, edge))) : 0), [center, edge]);
  const diameter = radius * 2;

  const onLongPress = (e: LongPressEvent) => {
    const coord = e.nativeEvent.coordinate;
    if (!center) {
      setCenter(coord);
      setEdge(null);
    } else {
      setEdge(coord);
    }
  };

  const reset = () => {
    setCenter(null);
    setEdge(null);
  };

  if (Platform.OS === 'web') {
    // Basic placeholder on web (react-native-maps web support may require extra setup)
    return (
      <View style={[styles.webWrap, { paddingTop: insets.top, paddingBottom: insets.bottom }]}> 
        <Text style={styles.title}>Explore</Text>
        <Text style={styles.sub}>الخريطة غير مفعّلة على الويب في هذا البناء. جرّب على iOS/Android.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <MapView
        style={StyleSheet.absoluteFill}
        provider={PROVIDER_GOOGLE}
        initialRegion={initialRegion}
        onLongPress={onLongPress}
      >
        {center && <Marker coordinate={center} title="Center" />}
        {center && edge && <Marker coordinate={edge} title="Edge" pinColor="#1e90ff" />}
        {center && radius > 0 && (
          <Circle center={center} radius={radius} strokeColor="rgba(30,144,255,0.9)" fillColor="rgba(30,144,255,0.2)" />
        )}
      </MapView>

      <View style={[styles.overlayTop, { paddingTop: insets.top + 8 }]}> 
        <Text style={styles.title}>Explore</Text>
        <Text style={styles.instructions}>
          اضغط مطولًا لتحديد مركز الدائرة، ثم اضغط مطولًا مرة ثانية لتحديد الحافة وحساب القطر.
        </Text>
      </View>

      <View style={[styles.overlayBottom, { paddingBottom: insets.bottom + 12 }]}> 
        <View style={styles.infoCard}>
          <Text style={styles.infoText}>Radius: {radius > 0 ? `${radius} m` : '--'}</Text>
          <Text style={styles.infoText}>Diameter: {radius > 0 ? `${diameter} m` : '--'}</Text>
        </View>
        <Pressable style={styles.resetBtn} onPress={reset}>
          <Text style={styles.resetTxt}>Reset</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f1115' },
  overlayTop: {
    position: 'absolute', left: 0, right: 0, top: 0,
    paddingHorizontal: 12,
  },
  overlayBottom: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  title: { color: '#fff', fontSize: 18, fontWeight: '800' },
  sub: { color: '#a6a6a6', marginTop: 6 },
  instructions: { color: '#d7d7d7', marginTop: 6 },
  infoCard: {
    backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10,
    alignSelf: 'center',
  },
  infoText: { color: '#fff', fontWeight: '700' },
  resetBtn: { marginTop: 8, backgroundColor: '#2a67ff', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10 },
  resetTxt: { color: '#fff', fontWeight: '800' },
  webWrap: { flex: 1, alignItems: 'center', backgroundColor: '#0f1115', padding: 16 },
});

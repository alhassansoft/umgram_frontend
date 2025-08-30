import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View, Pressable, LayoutChangeEvent, GestureResponderEvent, TextInput, ScrollView } from 'react-native';
import MapView, { Circle, Marker, PROVIDER_GOOGLE, Region, LongPressEvent, MapPressEvent } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '../auth/AuthContext';

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
  const mapRef = useRef<MapView | null>(null);
  const [myLoc, setMyLoc] = useState<{ latitude: number; longitude: number } | null>(null);
  // Keep content above the custom bottom bar and chips
  const TAB_BAR_HEIGHT = 64;
  const CHIPS_HEIGHT = 50;
  const GAP_BELOW_CHIPS = 8;
  const bottomOffset = insets.bottom + TAB_BAR_HEIGHT + CHIPS_HEIGHT + GAP_BELOW_CHIPS;
  const initialRegion: Region = useMemo(
    () => ({ latitude: 24.7136, longitude: 46.6753, latitudeDelta: 0.08, longitudeDelta: 0.08 }),
    [],
  );

  // Robust current location getter to mitigate kCLErrorLocationUnknown
  const getCurrentLatLng = React.useCallback(async (): Promise<{ latitude: number; longitude: number } | null> => {
    try {
      // Make sure provider is enabled and permissions are requested first
      const services = await Location.hasServicesEnabledAsync();
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (!services || status !== 'granted') return null;
      // Try last known location first for faster response
      const last = await Location.getLastKnownPositionAsync({ maxAge: 20000 }).catch(() => null);
      if (last && last.coords) {
        return { latitude: last.coords.latitude, longitude: last.coords.longitude };
      }
      // Then attempt current position; retry once on transient failures like kCLErrorLocationUnknown
      try {
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        return { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
      } catch (e) {
        await new Promise((r) => setTimeout(r, 1000));
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low });
        return { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
      }
    } catch {
      return null;
    }
  }, []);

  type GeoItem = { id: string; name?: string; center: { latitude: number; longitude: number }; radius: number };
  const [items, setItems] = useState<GeoItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showList, setShowList] = useState(false);
  const [persistNotice, setPersistNotice] = useState<string | null>(null);
  const [chatForId, setChatForId] = useState<string | null>(null);
  const [chatOwner, setChatOwner] = useState<{ owner_username?: string; owner_display_name?: string } | null>(null);
  const [chatMessages, setChatMessages] = useState<Array<{ id: string; user_id: string; username?: string; display_name?: string; text: string; created_at: string }>>([]);
  const [chatInput, setChatInput] = useState('');
  const lastChatLocRef = useRef<{ latitude: number; longitude: number } | null>(null);
  const lastMsgIdRef = useRef<string | null>(null);
  const timersRef = useRef<Record<string, any>>({});
  const LOCAL_KEY = 'explore.circles.native';
  const selectedItem = useMemo(() => items.find((it) => it.id === selectedId) || null, [items, selectedId]);

  // Load circles (server first, then local fallback)
  useEffect(() => {
    (async () => {
      try {
        const res = await api.get('/api/geo/circles');
        const rows: any[] = Array.isArray(res.data) ? res.data : (res.data?.circles || []);
        const loaded: GeoItem[] = rows.map((r: any) => ({
          id: String(r.id),
          name: r.name ?? '',
          center: { latitude: Number(r.lat), longitude: Number(r.lng) },
          radius: Number(r.radius) || 500,
        }));
        setItems(loaded);
        if (loaded.length) setSelectedId(loaded[0].id);
        // Save a snapshot locally, too
        try { await AsyncStorage.setItem(LOCAL_KEY, JSON.stringify(loaded)); } catch {}
      } catch {
        try {
          const raw = await AsyncStorage.getItem(LOCAL_KEY);
          const arr: GeoItem[] = raw ? JSON.parse(raw) : [];
          setItems(arr);
          if (arr.length) setSelectedId(arr[0].id);
          setPersistNotice('جارية في وضع الحفظ المحلي. سجّل الدخول لحفظ الدوائر في حسابك.');
        } catch {}
      }
    })();
    return () => {
      const t = timersRef.current;
      Object.keys(t).forEach((k) => { try { clearTimeout(t[k]); } catch {} });
    };
  }, []);

  const addItem = (coord: { latitude: number; longitude: number }) => {
    const tempId = `${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
    setItems((prev) => {
      const next = [...prev, { id: tempId, name: '', center: coord, radius: 500 }];
      // local snapshot always
      AsyncStorage.setItem(LOCAL_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
    setSelectedId(tempId);
    // Persist server
    (async () => {
      try {
        const res = await api.post('/api/geo/circles', { name: '', lat: coord.latitude, lng: coord.longitude, radius: 500 });
        const sid = String(res.data?.id ?? res.data?.circle?.id ?? res.data?.result?.id ?? '');
        if (sid) {
          setItems((prev) => prev.map((it) => (it.id === tempId ? { ...it, id: sid } : it)));
          setSelectedId((s) => (s === tempId ? sid : s));
          const snapshot = await AsyncStorage.getItem(LOCAL_KEY);
          const arr: GeoItem[] = snapshot ? JSON.parse(snapshot) : [];
          const arr2 = arr.map((it) => (it.id === tempId ? { ...it, id: sid } : it));
          await AsyncStorage.setItem(LOCAL_KEY, JSON.stringify(arr2));
        }
      } catch {
        setPersistNotice('لم يتم الحفظ للخادم. تم الحفظ محليًا مؤقتاً — سجّل الدخول للحفظ في الحساب.');
      }
    })();
  };
  const updateItemCenter = (id: string, coord: { latitude: number; longitude: number }) => {
    setItems((prev) => {
      const next = prev.map((it) => (it.id === id ? { ...it, center: coord } : it));
      AsyncStorage.setItem(LOCAL_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
    if (/^\d+$/.test(id)) {
      debouncePatch(id, { lat: coord.latitude, lng: coord.longitude });
    }
  };
  const updateItemRadius = (id: string, r: number) => {
    setItems((prev) => {
      const next = prev.map((it) => (it.id === id ? { ...it, radius: r } : it));
      AsyncStorage.setItem(LOCAL_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
    if (/^\d+$/.test(id)) debouncePatch(id, { radius: r });
  };
  const updateItemName = (id: string, name: string) => {
    setItems((prev) => {
      const next = prev.map((it) => (it.id === id ? { ...it, name } : it));
      AsyncStorage.setItem(LOCAL_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
    if (/^\d+$/.test(id)) debouncePatch(id, { name });
  };
  const deleteItem = (id: string) => {
    setItems((prev) => {
      const next = prev.filter((it) => it.id !== id);
      AsyncStorage.setItem(LOCAL_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
    if (selectedId === id) setSelectedId(null);
    if (/^\d+$/.test(id)) api.delete(`/api/geo/circles/${id}`).catch(() => {});
  };

  async function openChatNative(id: string) {
    try {
      // Use precise current location if available
      let lat: number | null = null;
      let lng: number | null = null;
      try {
        const coords = await getCurrentLatLng();
        if (coords) { lat = coords.latitude; lng = coords.longitude; }
      } catch {}
      // Fallback to map center or 0,0
      if (lat == null || lng == null) {
        const c = selectedItem?.center || myLoc || { latitude: 0, longitude: 0 };
        lat = c.latitude; lng = c.longitude;
      }
  const meta = await api.get(`/api/geo/circles/${id}`);
  setChatOwner({ owner_username: meta.data?.owner_username, owner_display_name: meta.data?.owner_display_name });
  const r = await api.get(`/api/geo/circles/${id}/chat/messages`, { params: { lat, lng, limit: 100 } });
  const rows = Array.isArray(r.data) ? r.data : [];
  setChatMessages(rows.map((m: any) => ({ id: String(m.id), user_id: String(m.user_id), username: m.username, display_name: m.display_name, text: String(m.text), created_at: String(m.created_at) })));
  lastChatLocRef.current = { latitude: lat!, longitude: lng! };
  lastMsgIdRef.current = rows.length ? String(rows[rows.length - 1].id) : null;
      setChatForId(id);
    } catch (err) {
      // ignore for now
    }
  }

  async function sendChatNative() {
    try {
      if (!chatForId || !chatInput.trim()) return;
      let lat: number | null = null;
      let lng: number | null = null;
      try {
        const coords = await getCurrentLatLng();
        if (coords) { lat = coords.latitude; lng = coords.longitude; }
      } catch {}
      if (lat == null || lng == null) {
        const c = selectedItem?.center || myLoc || { latitude: 0, longitude: 0 };
        lat = c.latitude; lng = c.longitude;
      }
      const r = await api.post(`/api/geo/circles/${chatForId}/chat/messages`, { text: chatInput.trim(), lat, lng });
  const m = r.data;
  setChatMessages((prev) => [...prev, { id: String(m.id), user_id: String(m.user_id), username: m.username, display_name: m.display_name, text: String(m.text), created_at: String(m.created_at) }]);
      lastChatLocRef.current = { latitude: lat!, longitude: lng! };
      lastMsgIdRef.current = String(m.id);
      setChatInput('');
    } catch {}
  }

  // Poll chat messages while chat panel is open (native)
  useEffect(() => {
    if (!chatForId) return;
    let mounted = true;
    const h = setInterval(async () => {
      try {
        if (!mounted || !chatForId) return;
        // Use last chat location, else selected center, else myLoc
        let lat = lastChatLocRef.current?.latitude;
        let lng = lastChatLocRef.current?.longitude;
        if (lat == null || lng == null) {
          const c = selectedItem?.center || myLoc;
          if (c) { lat = c.latitude; lng = c.longitude; }
        }
        if (lat == null || lng == null) return;
        const r = await api.get(`/api/geo/circles/${chatForId}/chat/messages`, { params: { lat, lng, limit: 100 } });
        const rows: any[] = Array.isArray(r.data) ? r.data : [];
        if (!mounted) return;
        if (rows.length) {
          const existingIds = new Set((chatMessages || []).map((m) => m.id));
          const newOnes = rows
            .map((m: any) => ({ id: String(m.id), user_id: String(m.user_id), username: m.username, display_name: m.display_name, text: String(m.text), created_at: String(m.created_at) }))
            .filter((m) => !existingIds.has(m.id));
          if (newOnes.length) {
            setChatMessages((prev) => {
              const prevIds = new Set(prev.map((x) => x.id));
              const additions = newOnes.filter((x) => !prevIds.has(x.id));
              const next = [...prev, ...additions];
              lastMsgIdRef.current = next.length ? next[next.length - 1].id : lastMsgIdRef.current;
              return next;
            });
          }
        }
      } catch {}
    }, 3000);
    return () => { mounted = false; try { clearInterval(h); } catch {} };
  }, [chatForId, selectedItem, myLoc, chatMessages]);

  function debouncePatch(id: string, data: Record<string, any>) {
    const t = timersRef.current;
    if (t[id]) { try { clearTimeout(t[id]); } catch {} }
    const k = `data:${id}`;
    t[k] = { ...(t[k] || {}), ...data };
    t[id] = setTimeout(async () => {
      try { await api.patch(`/api/geo/circles/${id}`, t[k]); } catch {}
      finally { delete t[id]; delete t[k]; }
    }, 400);
  }

  const onLongPress = (e: LongPressEvent) => {
  const coord = e.nativeEvent.coordinate;
  addItem(coord);
  };

  const onPress = (e: MapPressEvent) => {
  const coord = e.nativeEvent.coordinate;
  addItem(coord);
  };

  const reset = () => {
    if (selectedItem) deleteItem(selectedItem.id);
  };

  const radius = selectedItem?.radius ?? 0;
  const diameter = radius * 2;
  const setRadius = (v: number) => {
    if (selectedItem) updateItemRadius(selectedItem.id, v);
  };

  return (
    <View style={styles.container}>
      <MapView
  style={[StyleSheet.absoluteFill, { bottom: bottomOffset }]}
        provider={PROVIDER_GOOGLE}
        initialRegion={initialRegion}
        onLongPress={onLongPress}
        onPress={onPress}
        ref={mapRef}
      >
        {myLoc && (
          <Marker
            coordinate={myLoc}
            title="You"
            pinColor="#4285F4"
            zIndex={2000}
          />
        )}
        {items.map((it) => (
          <Marker
            key={`m-${it.id}`}
            coordinate={it.center}
            title={it.id === selectedId ? 'Selected' : 'Pin'}
            draggable
            onPress={() => setSelectedId(it.id)}
            onDragEnd={(e) => updateItemCenter(it.id, e.nativeEvent.coordinate)}
            pinColor={it.id === selectedId ? '#00c853' : '#ffeb3b'}
            zIndex={it.id === selectedId ? 999 : 1}
          />
        ))}
        {items.map((it) => {
          const isSel = it.id === selectedId;
          const stroke = isSel ? 'rgba(0,200,83,0.9)' : 'rgba(251,192,45,0.9)'; // green : yellow
          const fill = isSel ? 'rgba(0,200,83,0.2)' : 'rgba(255,235,59,0.2)';
          return (
            <Circle
              key={`c-${it.id}`}
              center={it.center}
              radius={it.radius}
              strokeColor={stroke}
              fillColor={fill}
              zIndex={isSel ? 998 : 0}
            />
          );
        })}
      </MapView>

  <View style={[styles.overlayTop, { paddingTop: insets.top + 8 }]}> 
        <Text style={styles.title}>Explore</Text>
        <Text style={styles.instructions}>
          اضغط لإضافة دبوس جديد. اضغط على أي دبوس لتحديده ثم عدّل نصف القطر بالشريط أو احذفه.
        </Text>
      </View>

      {selectedItem && (
        <View style={[styles.overlayBottom, { bottom: bottomOffset }]}> 
          <SliderBar value={radius} min={10} max={20000} onChange={setRadius} />
          <View style={[styles.infoCard, { marginTop: 8 }]}>
            <Text style={styles.infoText}>Radius: {radius > 0 ? `${radius} m` : '--'}</Text>
            <Text style={styles.infoText}>Diameter: {radius > 0 ? `${diameter} m` : '--'}</Text>
          </View>
          <Pressable style={styles.resetBtn} onPress={reset}>
            <Text style={styles.resetTxt}>Reset</Text>
          </Pressable>
        </View>
      )}

      {/* Locate Me button */}
      <Pressable
        onPress={async () => {
          try {
            const coords = await getCurrentLatLng();
            if (!coords) return;
            const { latitude, longitude } = coords;
            const region: Region = { latitude, longitude, latitudeDelta: 0.02, longitudeDelta: 0.02 };
            if (mapRef.current?.animateToRegion) mapRef.current.animateToRegion(region, 600);
            setMyLoc({ latitude, longitude });
          } catch {}
        }}
        style={[styles.locateBtn, { bottom: bottomOffset + 12 }]}
        accessibilityLabel="Go to my location"
        accessibilityRole="button"
      >
        <Text style={styles.locateTxt}>📍</Text>
      </Pressable>

      {/* Toggle list button */}
      <Pressable
        onPress={() => setShowList((s) => !s)}
        style={[styles.listBtn, { bottom: bottomOffset + 12 }]}
        accessibilityLabel="Open circles list"
        accessibilityRole="button"
      >
        <Text style={styles.locateTxt}>{showList ? '✖' : '📋'}</Text>
      </Pressable>

      {/* List Panel */}
      {showList && (
        <View style={[styles.listPanel, { bottom: bottomOffset + 64 }]}>
          <Text style={styles.listTitle}>دوائرك</Text>
          {!!persistNotice && (
            <Text style={[styles.infoTextSmall, { marginBottom: 6 }]}>{persistNotice}</Text>
          )}
          <ScrollView style={{ maxHeight: 280 }} contentContainerStyle={{ paddingBottom: 8 }}>
            {items.length === 0 && (
              <Text style={styles.listEmpty}>لا توجد دوائر بعد. اضغط على الخريطة لإضافة دبوس.</Text>
            )}
            {items.map((it) => {
              const isSel = it.id === selectedId;
              return (
                <View key={it.id} style={[styles.listRow, isSel && styles.listRowSelected]}>
                  <Pressable onPress={() => setSelectedId(it.id)} style={{ marginRight: 8 }}>
                    <Text style={[styles.rowDot, { color: isSel ? '#00c853' : '#fbc02d' }]}>●</Text>
                  </Pressable>
                  <View style={{ flex: 1 }}>
                    <TextInput
                      placeholder="اسم الدائرة"
                      placeholderTextColor="#aaa"
                      value={it.name ?? ''}
                      onChangeText={(t) => updateItemName(it.id, t)}
                      style={styles.nameInput}
                    />
                    <View style={{ height: 6 }} />
                    <SliderBar value={it.radius} min={10} max={20000} onChange={(v:number) => updateItemRadius(it.id, v)} />
                    <View style={styles.rowInfo}>
                      <Text style={styles.infoTextSmall}>Radius: {it.radius} m</Text>
                    </View>
                    <View style={{ flexDirection: 'row', marginTop: 6 }}>
                      <Pressable onPress={() => openChatNative(it.id)} style={styles.chatBtn} accessibilityLabel="Open circle chat">
                        <Text style={styles.chatBtnTxt}>💬 دردشة</Text>
                      </Pressable>
                    </View>
                  </View>
                  <Pressable onPress={() => deleteItem(it.id)} style={styles.deleteBtn} accessibilityLabel="Delete circle">
                    <Text style={styles.deleteTxt}>🗑</Text>
                  </Pressable>
                </View>
              );
            })}
          </ScrollView>
        </View>
      )}

      {chatForId && (
        <View style={[styles.chatPanel, { bottom: bottomOffset + 64 }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
            <Text style={styles.listTitle}>
              دردشة الدائرة #{chatForId}
              {chatOwner && (
                <Text style={styles.infoTextSmall}>
                  {'  '}— المنشئ: {chatOwner.owner_display_name || chatOwner.owner_username || '—'}
                </Text>
              )}
            </Text>
            <Pressable onPress={() => { setChatForId(null); setChatMessages([]); }}>
              <Text style={styles.locateTxt}>✖</Text>
            </Pressable>
          </View>
          <ScrollView style={{ maxHeight: 220 }}>
            {chatMessages.length === 0 && <Text style={styles.infoTextSmall}>لا رسائل بعد.</Text>}
            {chatMessages.map((m) => (
              <View key={m.id} style={styles.chatMsg}>
                <Text style={styles.chatMsgTxt}>{m.text}</Text>
                <Text style={styles.chatMeta}>{(m.display_name || m.username || m.user_id)} · {new Date(m.created_at).toLocaleString()}</Text>
              </View>
            ))}
          </ScrollView>
          <View style={{ flexDirection: 'row', marginTop: 8 }}>
            <TextInput
              value={chatInput}
              onChangeText={setChatInput}
              placeholder="اكتب رسالة…"
              placeholderTextColor="#aaa"
              style={[styles.nameInput, { flex: 1 }]}
            />
            <Pressable onPress={sendChatNative} style={[styles.chatBtn, { marginLeft: 8 }]}> 
              <Text style={styles.chatBtnTxt}>إرسال</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

function SliderBar({ value, min, max, onChange }:{ value:number; min:number; max:number; onChange:(v:number)=>void }){
  const [width, setWidth] = useState(0);
  const pct = width > 0 ? (value - min) / (max - min) : 0;
  const thumbX = Math.max(0, Math.min(width, pct * width));
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);
  const setFromX = (x:number) => {
    const clamped = Math.max(0, Math.min(width, x));
    const val = Math.round(min + (clamped / Math.max(1, width)) * (max - min));
    onChange(val);
  };
  const onGrant = (e: GestureResponderEvent) => setFromX(e.nativeEvent.locationX);
  const onMove  = (e: GestureResponderEvent) => setFromX(e.nativeEvent.locationX);
  return (
    <View style={styles.sliderWrap} onLayout={onLayout}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderGrant={onGrant}
      onResponderMove={onMove}
    >
      <View style={styles.sliderTrack} />
      <View style={[styles.sliderFill, { width: thumbX }]} />
      <View style={[styles.sliderThumb, { left: Math.max(0, thumbX - 10) }]} />
      <View style={styles.sliderLabels}>
        <Text style={styles.sliderLabelText}>صغير</Text>
        <Text style={styles.sliderLabelText}>كبير</Text>
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
  instructions: { color: '#d7d7d7', marginTop: 6 },
  infoCard: {
    backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10,
    alignSelf: 'center',
  },
  infoText: { color: '#fff', fontWeight: '700' },
  resetBtn: { marginTop: 8, backgroundColor: '#2a67ff', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10 },
  resetTxt: { color: '#fff', fontWeight: '800' },
  locateBtn: {
    position: 'absolute', right: 12, width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#2a67ff',
  },
  locateTxt: { color: '#fff', fontSize: 20, fontWeight: '800' },
  listBtn: { position: 'absolute', left: 12, width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: '#444' },
  listPanel: { position: 'absolute', left: 12, right: 12, backgroundColor: 'rgba(0,0,0,0.85)', borderRadius: 12, padding: 12 },
  listTitle: { color: '#fff', fontWeight: '800', marginBottom: 8 },
  listEmpty: { color: '#bbb' },
  listRow: { flexDirection: 'row', alignItems: 'center', padding: 8, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.08)', marginBottom: 8 },
  listRowSelected: { borderWidth: 1, borderColor: '#00c853' },
  rowDot: { fontSize: 18 },
  nameInput: { backgroundColor: 'rgba(255,255,255,0.12)', color: '#fff', paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8 },
  rowInfo: { marginTop: 6 },
  infoTextSmall: { color: '#ddd', fontSize: 12 },
  deleteBtn: { marginLeft: 8, width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: '#742a2a' },
  deleteTxt: { color: '#fff', fontSize: 16 },
  chatBtn: { backgroundColor: '#2a67ff', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  chatBtnTxt: { color: '#fff', fontWeight: '700' },
  chatPanel: { position: 'absolute', left: 12, right: 12, backgroundColor: 'rgba(0,0,0,0.9)', borderRadius: 12, padding: 10 },
  chatMsg: { paddingVertical: 6, borderBottomColor: 'rgba(255,255,255,0.08)', borderBottomWidth: StyleSheet.hairlineWidth },
  chatMsgTxt: { color: '#fff' },
  chatMeta: { color: '#aaa', fontSize: 11 },
  sliderWrap: { width: '92%', height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden' },
  sliderTrack: { position: 'absolute', left: 0, right: 0, top: 16, height: 4, backgroundColor: 'rgba(255,255,255,0.25)' },
  sliderFill: { position: 'absolute', left: 0, top: 16, height: 4, backgroundColor: '#2a67ff' },
  sliderThumb: { position: 'absolute', top: 8, width: 20, height: 20, borderRadius: 10, backgroundColor: '#2a67ff' },
  sliderLabels: { position: 'absolute', left: 12, right: 12, top: 2, flexDirection: 'row', justifyContent: 'space-between' },
  sliderLabelText: { color: '#d7d7d7', fontSize: 10 },
});

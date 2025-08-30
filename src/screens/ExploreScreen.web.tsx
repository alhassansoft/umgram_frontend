import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View, Pressable, TextInput, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import { api } from '../auth/AuthContext';

// Declare the global google var for TypeScript without adding types package
declare const google: any;
// Module-level timers for debounced PATCH operations
const __debounceTimers: Record<string, any> = {};

// Load Google Maps JS API dynamically
function useGoogleMaps(apiKey?: string) {
  const [ready, setReady] = useState<boolean>(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    // If already loaded
    if ((window as any).google?.maps) { setReady(true); return; }
    const key = apiKey
      || (Constants?.expoConfig?.extra as any)?.GOOGLE_MAPS_API_KEY
      || (process as any).env?.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!key) {
      console.warn('EXPO_PUBLIC_GOOGLE_MAPS_API_KEY missing. Set it in your env to enable the web map.');
      return;
    }
    const script = document.createElement('script');
  // Include geometry + marker libraries and follow best-practice loader flags
  script.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=geometry,marker&loading=async&v=weekly`;
    script.async = true;
    script.defer = true as any;
    script.onload = () => {
      const ensureReady = () => {
        const ok = !!(window as any).google?.maps?.Map;
        if (ok) setReady(true);
        else requestAnimationFrame(ensureReady);
      };
      ensureReady();
    };
    document.head.appendChild(script);
    return () => { document.head.removeChild(script); };
  }, [apiKey]);
  return ready;
}

export default function ExploreScreen() {
  const insets = useSafeAreaInsets();
  const ready = useGoogleMaps();
  const mapRef = useRef<HTMLDivElement | null>(null);
  const TAB_BAR_HEIGHT = 64;
  const CHIPS_HEIGHT = 50;
  const GAP_BELOW_CHIPS = 8;
  const bottomOffset = insets.bottom + TAB_BAR_HEIGHT + CHIPS_HEIGHT + GAP_BELOW_CHIPS;
  const [map, setMap] = useState<any>(null);
  type GeoItem = { id: string; name?: string; marker: any; circle: any; center: any; radius: number; isAdvanced: boolean };
  const [items, setItems] = useState<GeoItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [myMarker, setMyMarker] = useState<any>(null);
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);
  const [locateInfo, setLocateInfo] = useState<string | null>(null);
  const [showList, setShowList] = useState(false);
  const [nearby, setNearby] = useState<Array<{ id: string; name?: string; owner_username?: string; owner_display_name?: string }>>([]);
  const [chatForId, setChatForId] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<Array<{ id: string; user_id: string; username?: string; display_name?: string; text: string; created_at: string }>>([]);
  const [chatOwner, setChatOwner] = useState<{ owner_username?: string; owner_display_name?: string } | null>(null);
  const [chatInput, setChatInput] = useState('');
  // Track last known location used for chat access checks and last message id to minimize updates
  const lastChatLocRef = useRef<{ lat: number; lng: number } | null>(null);
  const lastMsgIdRef = useRef<string | null>(null);
  const [persistNotice, setPersistNotice] = useState<string | null>(null);
  const LOCAL_KEY = 'explore.circles';
  const saveTimers = useRef<Record<string, any>>({});
  const mapId = (Constants?.expoConfig?.extra as any)?.GOOGLE_MAPS_MAP_ID
    || (process as any).env?.EXPO_PUBLIC_GOOGLE_MAPS_MAP_ID;

  const initial = useMemo(() => ({ lat: 24.7136, lng: 46.6753, zoom: 12 }), []);

  useEffect(() => {
    if (!ready || !mapRef.current) return;
    if (!(google && google.maps && google.maps.Map)) return; // still not attached
    const gmap = new google.maps.Map(
      mapRef.current,
      {
        center: { lat: initial.lat, lng: initial.lng },
        zoom: initial.zoom,
        mapTypeControl: false,
        ...(mapId ? { mapId } : {}),
      }
    );
    setMap(gmap);

  const handleMapClick = (e: any) => {
      const coord = e.latLng;
      const preferAdvanced = Boolean(mapId);
      const tempId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      // Create circle with selected styling (green) since we select it immediately
      const circle = new google.maps.Circle({
        map: gmap,
        center: coord,
        radius: 500,
        strokeColor: '#00c853', // green when selected
        strokeOpacity: 0.9,
        fillColor: '#00c853',
        fillOpacity: 0.2,
      });
      const marker = createSelectableDraggableMarker(coord, gmap, preferAdvanced, {
        onSelect: () => setSelectedId(tempId),
        onDrag: (pos: any) => { circle.setCenter(pos); updateItemCenter(tempId, pos); },
      });
      const isAdvanced = !!(google?.maps?.marker?.AdvancedMarkerElement) && preferAdvanced;
      const newItem: GeoItem = { id: tempId, name: '', marker, circle, center: coord, radius: 500, isAdvanced };
      setItems((prev) => {
        const next = [...prev, newItem];
        // Always snapshot locally as a backup; harmless if also saved server-side
        try {
          const snapshot = next.map((it) => ({ id: it.id, name: it.name, center: { lat: it.center?.lat?.() ?? it.center?.lat ?? it.center?.latitude, lng: it.center?.lng?.() ?? it.center?.lng ?? it.center?.longitude }, radius: it.radius }));
          localStorage.setItem(LOCAL_KEY, JSON.stringify(snapshot));
        } catch {}
        return next;
      });
      setSelectedId(tempId);

      // Persist create
      (async () => {
        try {
          const p = latLngToObj(coord);
          const res = await api.post('/api/geo/circles', { name: '', lat: p.lat, lng: p.lng, radius: 500 });
          const serverId = String(res.data?.id ?? res.data?.circle?.id ?? res.data?.result?.id ?? '');
          if (serverId) {
            setItems((prev) => prev.map((it) => (it.id === tempId ? { ...it, id: serverId } : it)));
            setSelectedId((sid) => (sid === tempId ? serverId : sid));
            // Rebind marker listeners to use the new server id for select/drag updates
            try { if (google?.maps?.event) google.maps.event.clearInstanceListeners(marker); } catch {}
            try {
              const preferAdvancedNow = Boolean(mapId);
              const isAdv = !!(google?.maps?.marker?.AdvancedMarkerElement) && preferAdvancedNow;
              if (isAdv && marker?.addListener) {
                marker.addListener('gmp-click', () => setSelectedId(serverId));
                marker.addListener('dragend', (ev: any) => {
                  const pos = ev?.detail?.latLng || marker?.position;
                  circle.setCenter(pos);
                  updateItemCenter(serverId, pos);
                });
              } else if (marker?.addListener) {
                marker.addListener('click', () => setSelectedId(serverId));
                marker.addListener('dragend', (ev: any) => {
                  const pos = ev?.latLng || marker?.getPosition?.();
                  circle.setCenter(pos);
                  updateItemCenter(serverId, pos);
                });
              }
            } catch {}
            // Sync current center/radius in case user moved/edited before POST returned
            try {
              const c = typeof circle.getCenter === 'function' ? circle.getCenter() : circle.center;
              const rNow = typeof circle.getRadius === 'function' ? circle.getRadius() : 500;
              const p = latLngToObj(c);
              await api.patch(`/api/geo/circles/${serverId}`, { lat: p.lat, lng: p.lng, radius: rNow });
            } catch {}
          }
        } catch (err) {
          try {
            const snapshot = items.map((it) => ({ id: it.id, name: it.name, center: { lat: it.center?.lat?.() ?? it.center?.lat ?? it.center?.latitude, lng: it.center?.lng?.() ?? it.center?.lng ?? it.center?.longitude }, radius: it.radius }));
            localStorage.setItem(LOCAL_KEY, JSON.stringify(snapshot));
            setPersistNotice('لم يتم الحفظ للخادم. تم الحفظ محليًا مؤقتاً — سجّل الدخول للحفظ في الحساب.');
          } catch {}
        }
      })();
    };
    // Support both left click (primary) and right click to place points
    gmap.addListener('click', handleMapClick);
    gmap.addListener('rightclick', handleMapClick);

    return () => { if (google?.maps?.event) google.maps.event.clearInstanceListeners(gmap); };
  }, [ready, initial.lat, initial.lng, initial.zoom]);

  // Load existing circles after map is ready (fallback to local if unauthorized)
  useEffect(() => {
    if (!map) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get('/api/geo/circles');
        const rows: any[] = Array.isArray(res.data?.circles)
          ? res.data.circles
          : Array.isArray(res.data)
            ? res.data
            : [];
        const preferAdvanced = Boolean(mapId);
        const loaded: GeoItem[] = rows.map((r: any) => {
          const position = { lat: Number(r.lat), lng: Number(r.lng) } as any;
          const circle = new google.maps.Circle({
            map,
            center: position,
            radius: Number(r.radius) || 500,
            strokeColor: '#fbc02d',
            strokeOpacity: 0.9,
            fillColor: '#ffeb3b',
            fillOpacity: 0.2,
          });
          const marker = createSelectableDraggableMarker(position, map, preferAdvanced, {
            onSelect: () => setSelectedId(String(r.id)),
            onDrag: (pos: any) => { circle.setCenter(pos); updateItemCenter(String(r.id), pos); },
          });
          const isAdvanced = !!(google?.maps?.marker?.AdvancedMarkerElement) && preferAdvanced;
          return { id: String(r.id), name: r.name ?? '', marker, circle, center: position, radius: Number(r.radius) || 500, isAdvanced } as GeoItem;
        });
        if (!cancelled) {
          setItems(loaded);
          if (loaded.length) setSelectedId(loaded[0].id);
        }
      } catch (err) {
        // Local fallback
        try {
          const raw = localStorage.getItem(LOCAL_KEY);
          const arr = raw ? JSON.parse(raw) as any[] : [];
          const preferAdvanced = Boolean(mapId);
          const loaded: GeoItem[] = arr.map((r: any) => {
            const position = { lat: Number(r.center?.lat ?? r.lat), lng: Number(r.center?.lng ?? r.lng) } as any;
            const circle = new google.maps.Circle({
              map,
              center: position,
              radius: Number(r.radius) || 500,
              strokeColor: '#fbc02d',
              strokeOpacity: 0.9,
              fillColor: '#ffeb3b',
              fillOpacity: 0.2,
            });
            const marker = createSelectableDraggableMarker(position, map, preferAdvanced, {
              onSelect: () => setSelectedId(String(r.id)),
              onDrag: (pos: any) => { circle.setCenter(pos); updateItemCenter(String(r.id), pos); },
            });
            const isAdvanced = !!(google?.maps?.marker?.AdvancedMarkerElement) && preferAdvanced;
            return { id: String(r.id), name: r.name ?? '', marker, circle, center: position, radius: Number(r.radius) || 500, isAdvanced } as GeoItem;
          });
          if (!cancelled) {
            setPersistNotice('جارية في وضع الحفظ المحلي. سجّل الدخول لحفظ الدوائر في حسابك.');
            setItems(loaded);
            if (loaded.length) setSelectedId(loaded[0].id);
          }
        } catch {}
      }
    })();
    return () => { cancelled = true; };
  }, [map, mapId]);

  // Accessibility: if a focused element is inside an aria-hidden ancestor, blur it
  useEffect(() => {
    if (!ready) return;
    const active = (document.activeElement as HTMLElement | null);
    let node: HTMLElement | null = active;
    while (node) {
      if (node.getAttribute && node.getAttribute('aria-hidden') === 'true') {
        if (active && typeof active.blur === 'function') active.blur();
        break;
      }
      node = node.parentElement;
    }
  }, [ready]);

  // Clear any pending debounced timers on unmount (best-effort)
  useEffect(() => {
    return () => {
      try {
        Object.keys(__debounceTimers).forEach((k) => {
          try { clearTimeout(__debounceTimers[k]); } catch {}
          delete __debounceTimers[k];
        });
      } catch {}
    };
  }, []);

  const selectedItem = useMemo(() => items.find((it) => it.id === selectedId) || null, [items, selectedId]);

  const updateItemCenter = (id: string, pos: any) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, center: pos } : it)));
    // Persist (debounced)
    if (isServerId(id)) {
      const p = latLngToObj(pos);
      debouncedPatch(id, { lat: p.lat, lng: p.lng });
    } else {
      try {
        const snapshot = items.map((it) => ({ id: it.id, name: it.name, center: { lat: it.center?.lat?.() ?? it.center?.lat ?? it.center?.latitude, lng: it.center?.lng?.() ?? it.center?.lng ?? it.center?.longitude }, radius: it.radius }));
        localStorage.setItem(LOCAL_KEY, JSON.stringify(snapshot));
      } catch {}
    }
  };
  const updateItemRadius = (id: string, newRadius: number) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, radius: newRadius } : it)));
    const it = items.find((x) => x.id === id);
    if (it && it.circle) it.circle.setRadius(newRadius);
    if (isServerId(id)) {
      debouncedPatch(id, { radius: newRadius });
    } else {
      try {
        const snapshot = items.map((it) => ({ id: it.id, name: it.name, center: { lat: it.center?.lat?.() ?? it.center?.lat ?? it.center?.latitude, lng: it.center?.lng?.() ?? it.center?.lng ?? it.center?.longitude }, radius: it.radius }));
        localStorage.setItem(LOCAL_KEY, JSON.stringify(snapshot));
      } catch {}
    }
  };
  const updateItemName = (id: string, name: string) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, name } : it)));
    if (isServerId(id)) {
      debouncedPatch(id, { name });
    } else {
      try {
        const snapshot = items.map((it) => ({ id: it.id, name: it.name, center: { lat: it.center?.lat?.() ?? it.center?.lat ?? it.center?.latitude, lng: it.center?.lng?.() ?? it.center?.lng ?? it.center?.longitude }, radius: it.radius }));
        localStorage.setItem(LOCAL_KEY, JSON.stringify(snapshot));
      } catch {}
    }
  };
  const deleteItem = (id: string) => {
    const it = items.find((x) => x.id === id);
    if (it) {
      try { it.marker?.setMap && it.marker.setMap(null); } catch {}
      try { it.circle?.setMap && it.circle.setMap(null); } catch {}
    }
    setItems((prev) => prev.filter((x) => x.id !== id));
    if (selectedId === id) setSelectedId(null);
    if (isServerId(id)) {
      api.delete(`/api/geo/circles/${id}`).catch((err) => console.warn('Failed to delete circle', err));
    } else {
      try {
        const snapshot = items.filter((x) => x.id !== id).map((it) => ({ id: it.id, name: it.name, center: { lat: it.center?.lat?.() ?? it.center?.lat ?? it.center?.latitude, lng: it.center?.lng?.() ?? it.center?.lng ?? it.center?.longitude }, radius: it.radius }));
        localStorage.setItem(LOCAL_KEY, JSON.stringify(snapshot));
      } catch {}
    }
  };

  async function openChat(id: string) {
    try {
      if (!map) return;
      let lat = 0, lng = 0;
      const center = map.getCenter?.();
      if (center) { lat = center.lat(); lng = center.lng(); }
      try {
        await new Promise<void>((resolve) => {
          if (!navigator?.geolocation) return resolve();
          navigator.geolocation.getCurrentPosition(
            (pos) => { lat = pos.coords.latitude; lng = pos.coords.longitude; resolve(); },
            () => resolve(),
            { enableHighAccuracy: true, timeout: 3000 }
          );
        });
      } catch {}
  const meta = await api.get(`/api/geo/circles/${id}`);
  setChatOwner({ owner_username: meta.data?.owner_username, owner_display_name: meta.data?.owner_display_name });
  const r = await api.get(`/api/geo/circles/${id}/chat/messages`, { params: { lat, lng, limit: 100 } });
      const rows = Array.isArray(r.data) ? r.data : [];
  setChatMessages(rows.map((m: any) => ({ id: String(m.id), user_id: String(m.user_id), username: m.username, display_name: m.display_name, text: String(m.text), created_at: String(m.created_at) })));
      // track the last used location and last message id
      lastChatLocRef.current = { lat, lng };
      lastMsgIdRef.current = rows.length ? String(rows[rows.length - 1].id) : null;
      setChatForId(id);
    } catch (err) {
      console.warn('Open chat failed', err);
    }
  }

  async function sendChat() {
    try {
      if (!chatForId || !chatInput.trim()) return;
      let lat = 0, lng = 0;
      const center = map?.getCenter?.();
      if (center) { lat = center.lat(); lng = center.lng(); }
      try {
        await new Promise<void>((resolve) => {
          if (!navigator?.geolocation) return resolve();
          navigator.geolocation.getCurrentPosition(
            (pos) => { lat = pos.coords.latitude; lng = pos.coords.longitude; resolve(); },
            () => resolve(),
            { enableHighAccuracy: true, timeout: 3000 }
          );
        });
      } catch {}
      const r = await api.post(`/api/geo/circles/${chatForId}/chat/messages`, { text: chatInput.trim(), lat, lng });
  const m = r.data;
  setChatMessages((prev) => [...prev, { id: String(m.id), user_id: String(m.user_id), username: m.username, display_name: m.display_name, text: String(m.text), created_at: String(m.created_at) }]);
  lastChatLocRef.current = { lat, lng };
  lastMsgIdRef.current = String(m.id);
      setChatInput('');
    } catch (err) {
      console.warn('Send chat failed', err);
    }
  }

  // Poll chat messages while the chat panel is open
  useEffect(() => {
    if (!chatForId) return;
    let active = true;
    const interval = window.setInterval(async () => {
      try {
        if (!active || !chatForId) return;
        // Try to use last location; if missing, use map center as an approximation
        let lat = lastChatLocRef.current?.lat ?? 0;
        let lng = lastChatLocRef.current?.lng ?? 0;
        if ((lat === 0 && lng === 0) && map?.getCenter) {
          const c = map.getCenter();
          if (c) { lat = c.lat(); lng = c.lng(); }
        }
        const r = await api.get(`/api/geo/circles/${chatForId}/chat/messages`, { params: { lat, lng, limit: 100 } });
        const rows: any[] = Array.isArray(r.data) ? r.data : [];
        if (!active) return;
        // If we already have messages, only append the new ones
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
    return () => { active = false; try { window.clearInterval(interval); } catch {} };
  }, [chatForId, map, chatMessages]);

  // Visually highlight selected marker
  useEffect(() => {
    items.forEach((it) => {
      const isSel = it.id === selectedId;
      styleMarkerSelection(it.marker, isSel, it.isAdvanced);
      try { if (it.marker) it.marker.zIndex = isSel ? 999 : 1; } catch {}
      // Update circle color: green if selected, yellow if not
      try {
        const strokeColor = isSel ? '#00c853' : '#fbc02d';
        const fillColor = isSel ? '#00c853' : '#ffeb3b';
        if (typeof it.circle?.setOptions === 'function') {
          it.circle.setOptions({ strokeColor, fillColor, strokeOpacity: 0.9, fillOpacity: 0.2 });
        } else if (it.circle) {
          it.circle.set && it.circle.set('strokeColor', strokeColor);
          it.circle.set && it.circle.set('fillColor', fillColor);
          it.circle.set && it.circle.set('strokeOpacity', 0.9);
          it.circle.set && it.circle.set('fillOpacity', 0.2);
        }
      } catch {}
    });
  }, [selectedId, items]);

  const reset = () => {
    if (selectedItem) deleteItem(selectedItem.id);
  };

  const handleLocate = React.useCallback(() => {
    try {
      setLocateError(null);
      setLocateInfo(null);
      if (!map) { setLocateError('الخريطة غير جاهزة بعد'); return; }
      if (!(navigator && 'geolocation' in navigator)) { setLocateError('المتصفح لا يدعم تحديد الموقع'); return; }
      if (!(window.isSecureContext || location.hostname === 'localhost')) {
        setLocateError('يتطلب تحديد الموقع اتصالاً آمناً (HTTPS) إلا على localhost');
        // continue anyway; some browsers still allow on localhost
      }
      setLocating(true);
      const preferAdvanced = Boolean(mapId);
      const attempt = (opts: PositionOptions): Promise<GeolocationPosition> => new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, opts);
      });
      (async () => {
        try {
          // First attempt: high accuracy
          const pos = await attempt({ enableHighAccuracy: true, timeout: 12000 });
          const { latitude, longitude } = pos.coords;
          const position = { lat: latitude, lng: longitude } as any;
          try { map.setCenter(position); map.setZoom && map.setZoom(15); } catch {}
          if (myMarker) {
            try {
              if (typeof myMarker.setPosition === 'function') myMarker.setPosition(position);
              else myMarker.position = position;
              if (typeof myMarker.setMap === 'function') myMarker.setMap(map);
            } catch {}
          } else {
            const m = createMyLocationMarker(position, map, preferAdvanced);
            setMyMarker(m);
          }
        } catch (err1:any) {
          // Retry: lower accuracy, longer timeout
          try {
            const pos = await attempt({ enableHighAccuracy: false, timeout: 15000 });
            const { latitude, longitude } = pos.coords;
            const position = { lat: latitude, lng: longitude } as any;
            try { map.setCenter(position); map.setZoom && map.setZoom(15); } catch {}
            if (myMarker) {
              try {
                if (typeof myMarker.setPosition === 'function') myMarker.setPosition(position);
                else myMarker.position = position;
                if (typeof myMarker.setMap === 'function') myMarker.setMap(map);
              } catch {}
            } else {
              const m = createMyLocationMarker(position, map, preferAdvanced);
              setMyMarker(m);
            }
          } catch (err2:any) {
            // Fallback: use map center as approximate location
            try {
              const c = map.getCenter?.();
              if (c) {
                const position = { lat: c.lat(), lng: c.lng() } as any;
                if (myMarker) {
                  try {
                    if (typeof myMarker.setPosition === 'function') myMarker.setPosition(position);
                    else myMarker.position = position;
                    if (typeof myMarker.setMap === 'function') myMarker.setMap(map);
                  } catch {}
                } else {
                  const m = createMyLocationMarker(position, map, preferAdvanced);
                  setMyMarker(m);
                }
                setLocateInfo('لم نتمكن من تحديد موقعك بدقة. استخدمنا مركز الخريطة كموقع تقريبي.');
                window.setTimeout(() => setLocateInfo(null), 6000);
              } else {
                let msg = 'تعذّر تحديد موقعك.';
                const code = (err2 && typeof err2.code === 'number') ? err2.code : undefined;
                if (code === 1) msg = 'تم رفض إذن الموقع. فعّله من إعدادات المتصفح.';
                else if (code === 2) msg = 'الموقع غير متاح حالياً. حاول لاحقاً.';
                else if (code === 3) msg = 'انتهت مهلة تحديد الموقع. حاول مجدداً.';
                setLocateError(msg);
                window.setTimeout(() => setLocateError(null), 5000);
              }
            } catch {}
          }
        } finally {
          setLocating(false);
        }
      })();
    } catch (e) {
      setLocateError('حدث خطأ غير متوقع أثناء تحديد الموقع');
      setLocating(false);
      window.setTimeout(() => setLocateError(null), 5000);
    }
  }, [map, mapId, myMarker]);

  const { radiusMeters, diameterMeters, radiusText, diameterText } = useMemo(() => {
    if (!selectedItem) return { radiusMeters: 0, diameterMeters: 0, radiusText: '-', diameterText: '-' };
    const r = selectedItem.radius;
    const d = r * 2;
    const toText = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${m.toFixed(0)} m`);
    return { radiusMeters: r, diameterMeters: d, radiusText: toText(r), diameterText: toText(d) };
  }, [selectedItem]);

  return (
    <View style={styles.container}>
      {!ready && (
        <View style={[styles.loadingWrap, { paddingTop: insets.top, paddingBottom: bottomOffset }]}> 
          <Text style={styles.loadingText}>Loading map… Ensure EXPO_PUBLIC_GOOGLE_MAPS_API_KEY is set.</Text>
        </View>
      )}
      <View ref={mapRef as any} style={[StyleSheet.absoluteFill, { top: insets.top, bottom: bottomOffset }]} />
      <View style={[styles.overlayTop, { paddingTop: insets.top + 8 }]}> 
  <Text style={styles.title}>Explore</Text>
  <Text style={styles.instructions}>انقر على الخريطة لإضافة دبوس. اضغط أي دبوس لتعديله أو حذفه.</Text>
        {!mapId && (
          <Text style={[styles.instructions, { color: '#ffcc66' }]}>ملاحظة: استخدم Advanced Markers عبر توفير GOOGLE_MAPS_MAP_ID.</Text>
        )}
      </View>
    {selectedItem && (
        <View style={[styles.overlayBottom, { bottom: bottomOffset - 12 }]}> 
          <View style={styles.metricsRow}>
            <Text style={styles.metricLabel}>Radius:</Text>
            <Text style={styles.metricValue}>{radiusText}</Text>
            <View style={{ width: 16 }} />
            <Text style={styles.metricLabel}>Diameter:</Text>
            <Text style={styles.metricValue}>{diameterText}</Text>
          </View>
      <Slider value={selectedItem.radius} min={10} max={20000} onChange={(v:number) => updateItemRadius(selectedItem.id, v)} />
          <Pressable style={styles.resetBtn} onPress={reset}>
            <Text style={styles.resetTxt}>Reset</Text>
          </Pressable>
        </View>
      )}

      {/* Locate Me button (web) */}
      <Pressable
        onPress={handleLocate}
        style={[styles.locateBtn, { bottom: bottomOffset + 12, opacity: locating ? 0.7 : 1 }]}
        accessibilityLabel="Go to my location"
        accessibilityRole="button"
        disabled={locating}
      >
        <Text style={styles.locateTxt}>{locating ? '…' : '📍'}</Text>
      </Pressable>

      {locateError && (
        <View style={[styles.toast, { bottom: bottomOffset + 64 }]}>
          <Text style={styles.toastTxt}>{locateError}</Text>
        </View>
      )}

      {locateInfo && (
        <View style={[styles.toast, { bottom: bottomOffset + 90 }]}>
          <Text style={styles.toastTxt}>{locateInfo}</Text>
        </View>
      )}

      {persistNotice && (
        <View style={[styles.toast, { bottom: bottomOffset + 110, left: 12, right: 12 }]}> 
          <Text style={styles.toastTxt}>{persistNotice}</Text>
        </View>
      )}

      {/* Toggle list button (left) */}
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
              <View style={{ flexDirection: 'row', marginBottom: 8 }}>
                <Pressable
                  onPress={async () => {
                    try {
                      let lat = 0, lng = 0;
                      const c = map?.getCenter?.();
                      if (c) { lat = c.lat(); lng = c.lng(); }
                      await new Promise<void>((resolve) => {
                        if (!navigator?.geolocation) return resolve();
                        navigator.geolocation.getCurrentPosition(
                          (pos) => { lat = pos.coords.latitude; lng = pos.coords.longitude; resolve(); },
                          () => resolve(),
                          { enableHighAccuracy: false, timeout: 4000 }
                        );
                      });
                      const r = await api.get('/api/geo/circles/nearby', { params: { lat, lng, limit: 50 } });
                      const arr = Array.isArray(r.data) ? r.data : [];
                      setNearby(arr.map((x:any) => ({ id: String(x.id), name: x.name, owner_username: x.owner_username, owner_display_name: x.owner_display_name })));
                    } catch {}
                  }}
                  style={[styles.chatBtn, { marginRight: 8 }]}
                >
                  <Text style={styles.chatBtnTxt}>اظهار الدوائر القريبة</Text>
                </Pressable>
                {nearby.length > 0 && <Text style={styles.infoTextSmall}>وجدنا {nearby.length} دوائر تحتوي موقعك.</Text>}
              </View>
          <ScrollView style={{ maxHeight: 280 }} contentContainerStyle={{ paddingBottom: 8 }}>
            {items.length === 0 && (
              <Text style={styles.listEmpty}>لا توجد دوائر بعد. اضغط على الخريطة لإضافة دبوس.</Text>
            )}
            {nearby.length > 0 && (
              <View style={{ marginBottom: 8 }}>
                <Text style={[styles.infoTextSmall, { marginBottom: 4 }]}>دوائر قريبة يمكنك الانضمام لدردشتها:</Text>
                {nearby.map((c) => (
                  <View key={`nb-${c.id}`} style={[styles.listRow]}> 
                    <View style={{ flex: 1 }}>
                      <Text style={styles.infoTextSmall}>#{c.id} — {c.name || 'بدون اسم'} · المنشئ: {c.owner_display_name || c.owner_username || '—'}</Text>
                    </View>
                    <Pressable onPress={() => openChat(c.id)} style={styles.chatBtn}>
                      <Text style={styles.chatBtnTxt}>فتح دردشة</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
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
                      value={it.name ?? ''}
                      onChangeText={(t) => updateItemName(it.id, t)}
                      style={styles.nameInput}
                    />
                    <View style={{ height: 6 }} />
                    <Slider
                      value={it.radius}
                      min={10}
                      max={20000}
                      onChange={(v:number) => updateItemRadius(it.id, v)}
                    />
                    <View style={styles.rowInfo}>
                      <Text style={styles.infoTextSmall}>Radius: {it.radius} m</Text>
                    </View>
                    <View style={{ flexDirection: 'row', marginTop: 6 }}>
                      <Pressable onPress={() => openChat(it.id)} style={styles.chatBtn} accessibilityLabel="Open circle chat">
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
                <Text style={styles.chatMeta}>
                  {m.display_name || m.username || m.user_id} · {new Date(m.created_at).toLocaleString()}
                </Text>
              </View>
            ))}
          </ScrollView>
          <View style={{ flexDirection: 'row', marginTop: 8 }}>
            <input
              value={chatInput}
              onChange={(e) => setChatInput((e.target as HTMLInputElement).value)}
              placeholder="اكتب رسالة…"
              style={{ flex: 1, padding: 8, borderRadius: 8 }}
            />
            <Pressable onPress={sendChat} style={[styles.chatBtn, { marginLeft: 8 }]}> 
              <Text style={styles.chatBtnTxt}>إرسال</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

// Helper to create a draggable marker with AdvancedMarkerElement when available; falls back to Marker.
function createDraggableMarker(position: any, map: any, onDragEnd: (pos: any) => void, preferAdvanced: boolean) {
  try {
    const AdvancedMarker = google?.maps?.marker?.AdvancedMarkerElement;
  if (AdvancedMarker && preferAdvanced) {
      const m = new AdvancedMarker({ map, position, gmpDraggable: true });
      // AdvancedMarkerElement emits 'dragend' with event.detail.latLng
      m.addListener('dragend', (ev: any) => {
        const pos = ev?.detail?.latLng || position;
        onDragEnd(pos);
      });
      // Provide setMap(null) compatibility for cleanup
      if (!m.setMap) m.setMap = (val: any) => { if (val === null) m.map = null; };
      return m;
    }
  } catch {}
  // Fallback to classic Marker
  const m = new google.maps.Marker({ map, position, draggable: true });
  m.addListener('dragend', (ev: any) => {
    const pos = ev.latLng || m.getPosition();
    onDragEnd(pos);
  });
  return m;
}

// Selectable + draggable marker helper (click selects, drag updates)
function createSelectableDraggableMarker(position: any, map: any, preferAdvanced: boolean, handlers: { onSelect: () => void; onDrag: (pos:any)=>void }) {
  try {
    const AdvancedMarker = google?.maps?.marker?.AdvancedMarkerElement;
    if (AdvancedMarker && preferAdvanced) {
      const m = new AdvancedMarker({ map, position, gmpDraggable: true });
      m.addListener('gmp-click', () => handlers.onSelect());
      m.addListener('dragend', (ev: any) => {
        const pos = ev?.detail?.latLng || position;
        handlers.onDrag(pos);
      });
      if (!m.setMap) m.setMap = (val: any) => { if (val === null) m.map = null; };
      return m;
    }
  } catch {}
  const m = new google.maps.Marker({ map, position, draggable: true });
  m.addListener('click', () => handlers.onSelect());
  m.addListener('dragend', (ev: any) => {
    const pos = ev.latLng || m.getPosition();
    handlers.onDrag(pos);
  });
  return m;
}

function createMyLocationMarker(position:any, map:any, preferAdvanced:boolean){
  try {
    const AdvancedMarker = google?.maps?.marker?.AdvancedMarkerElement;
    const Pin = google?.maps?.marker?.PinElement;
    if (AdvancedMarker && Pin && preferAdvanced) {
      const pin = new Pin({ background: '#4285F4', glyphColor: '#fff', borderColor: '#2a67ff' });
      const m = new AdvancedMarker({ map, position, content: pin.element });
      m.zIndex = 2000;
      return m;
    }
  } catch {}
  const svg = `<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 22 22"><circle cx="11" cy="11" r="9" fill="#4285F4" stroke="#fff" stroke-width="2"/></svg>`;
  const icon = {
    url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg),
    scaledSize: new google.maps.Size(22,22),
    anchor: new google.maps.Point(11,11),
  };
  const m = new google.maps.Marker({ map, position, icon });
  (m as any).zIndex = 2000;
  return m;
}

// Helpers for selected styling
function buildAdvancedPinElement(selected: boolean) {
  try {
    const Pin = google?.maps?.marker?.PinElement;
    if (Pin) {
      const pin = new Pin({
        background: selected ? '#00c853' : '#ffeb3b', // green : yellow
        borderColor: selected ? '#0a8f4e' : '#f9a825',
        glyphColor: '#111',
      });
      const el = pin.element;
      el.style.filter = selected ? 'drop-shadow(0 0 8px rgba(255,255,255,0.9))' : 'none';
      return el;
    }
  } catch {}
  const span = document.createElement('span');
  span.style.width = '20px';
  span.style.height = '20px';
  span.style.borderRadius = '10px';
  span.style.background = selected ? '#ffcc00' : '#2a67ff';
  span.style.display = 'inline-block';
  span.style.filter = selected ? 'drop-shadow(0 0 8px rgba(255,255,255,0.9))' : 'none';
  return span;
}

function svgIcon(selected: boolean) {
  const size = selected ? 26 : 20;
  const r = selected ? 10 : 8;
  const stroke = selected ? 'white' : 'none';
  const fill = selected ? '#00c853' : '#ffeb3b';
  const svg = `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${size/2}" cy="${size/2}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="2"/></svg>`;
  return {
    url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg),
    scaledSize: new google.maps.Size(size, size),
    anchor: new google.maps.Point(size/2, size/2),
  };
}

function styleMarkerSelection(marker: any, selected: boolean, isAdvanced: boolean) {
  try {
    if (isAdvanced && google?.maps?.marker?.AdvancedMarkerElement && marker) {
      const el = buildAdvancedPinElement(selected);
      marker.content = el;
      return;
    }
  } catch {}
  try {
    marker.setIcon && marker.setIcon(svgIcon(selected));
  } catch {}
}

// Utilities for persistence
function isServerId(id: string) {
  return /^\d+$/.test(id);
}

function latLngToObj(pos: any) {
  const lat = typeof pos?.lat === 'function' ? pos.lat() : pos?.lat;
  const lng = typeof pos?.lng === 'function' ? pos.lng() : pos?.lng;
  return { lat: Number(lat), lng: Number(lng) };
}

function debouncedPatch(id: string, data: Record<string, any>) {
  const key = `data:${id}`;
  const pending = { ...(__debounceTimers[key] || {}), ...data };
  __debounceTimers[key] = pending;
  if (__debounceTimers[id]) {
    try { clearTimeout(__debounceTimers[id]); } catch {}
  }
  __debounceTimers[id] = setTimeout(async () => {
    try {
      await api.patch(`/api/geo/circles/${id}`, pending);
    } catch (err) {
      console.warn('Failed to patch circle', id, err);
    } finally {
      delete __debounceTimers[id];
      delete __debounceTimers[key];
    }
  }, 400);
}

// Haversine fallback if geometry.spherical is not available
function computeDistanceMeters(a: any, b: any): number {
  try {
    if (google?.maps?.geometry?.spherical?.computeDistanceBetween) {
      return google.maps.geometry.spherical.computeDistanceBetween(a, b);
    }
  } catch {}
  const lat1 = typeof a.lat === 'function' ? a.lat() : a.lat;
  const lon1 = typeof a.lng === 'function' ? a.lng() : a.lng;
  const lat2 = typeof b.lat === 'function' ? b.lat() : b.lat;
  const lon2 = typeof b.lng === 'function' ? b.lng() : b.lng;
  const R = 6371000; // meters
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const s1 = Math.sin(dLat / 2) ** 2;
  const s2 = Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(s1 + s2), Math.sqrt(1 - (s1 + s2)));
  return R * c;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f1115' },
  overlayTop: { position: 'absolute', left: 0, right: 0, top: 0, paddingHorizontal: 12 },
  overlayBottom: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 12, alignItems: 'center' },
  metricsRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  title: { color: '#fff', fontSize: 18, fontWeight: '800' },
  instructions: { color: '#d7d7d7', marginTop: 6 },
  resetBtn: { backgroundColor: '#2a67ff', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10 },
  resetTxt: { color: '#fff', fontWeight: '800' },
  metricLabel: { color: '#c8c8c8', fontWeight: '600' },
  metricValue: { color: '#fff', fontWeight: '800', marginLeft: 6 },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0f1115' },
  loadingText: { color: '#c9c9c9' },
  locateBtn: { position: 'absolute', right: 12, width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: '#2a67ff' },
  locateTxt: { color: '#fff', fontSize: 20, fontWeight: '800' },
  toast: { position: 'absolute', right: 12, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8, backgroundColor: 'rgba(0,0,0,0.75)' },
  toastTxt: { color: '#fff' },
  listBtn: { position: 'absolute', left: 12, width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: '#444' },
  listPanel: { position: 'absolute', left: 12, right: 12, backgroundColor: 'rgba(0,0,0,0.8)', borderRadius: 12, padding: 12 },
  listTitle: { color: '#fff', fontWeight: '800', marginBottom: 8 },
  listEmpty: { color: '#bbb' },
  listRow: { flexDirection: 'row', alignItems: 'center', padding: 8, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.05)', marginBottom: 8 },
  listRowSelected: { borderWidth: 1, borderColor: '#00c853' },
  rowDot: { fontSize: 18 },
  nameInput: { backgroundColor: 'rgba(255,255,255,0.1)', color: '#fff', paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8 },
  rowInfo: { marginTop: 6 },
  infoTextSmall: { color: '#ddd', fontSize: 12 },
  deleteBtn: { marginLeft: 8, width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: '#742a2a' },
  deleteTxt: { color: '#fff', fontSize: 16 },
  chatBtn: { backgroundColor: '#2a67ff', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  chatBtnTxt: { color: '#fff', fontWeight: '700' },
  chatPanel: { position: 'absolute', left: 12, right: 12, backgroundColor: 'rgba(0,0,0,0.9)', borderRadius: 12, padding: 10 },
  chatMsg: { paddingVertical: 6, borderBottomColor: 'rgba(255,255,255,0.08)', borderBottomWidth: 1 },
  chatMsgTxt: { color: '#fff' },
  chatMeta: { color: '#aaa', fontSize: 11 },
});

function Slider({ value, min, max, onChange }:{ value:number; min:number; max:number; onChange:(v:number)=>void }){
  const [width, setWidth] = useState(0);
  const pct = width > 0 ? (value - min) / (max - min) : 0;
  const thumbX = Math.max(0, Math.min(width, pct * width));
  return (
    <View style={sliderStyles.wrap}
      onLayout={(e:any) => setWidth(e.nativeEvent.layout.width)}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderGrant={(e:any) => onChange(Math.round(min + (e.nativeEvent.locationX / Math.max(1, width)) * (max - min)))}
      onResponderMove={(e:any) => onChange(Math.round(min + (e.nativeEvent.locationX / Math.max(1, width)) * (max - min)))}
    >
      <View style={sliderStyles.track} />
      <View style={[sliderStyles.fill, { width: thumbX }]} />
      <View style={[sliderStyles.thumb, { left: Math.max(0, thumbX - 10) }]} />
      <View style={sliderStyles.labels}>
        <Text style={sliderStyles.labelTxt}>صغير</Text>
        <Text style={sliderStyles.labelTxt}>كبير</Text>
      </View>
    </View>
  );
}

const sliderStyles = StyleSheet.create({
  wrap: { width: '92%', height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden', marginBottom: 8 },
  track: { position: 'absolute', left: 0, right: 0, top: 16, height: 4, backgroundColor: 'rgba(255,255,255,0.25)' },
  fill: { position: 'absolute', left: 0, top: 16, height: 4, backgroundColor: '#2a67ff' },
  thumb: { position: 'absolute', top: 8, width: 20, height: 20, borderRadius: 10, backgroundColor: '#2a67ff' },
  labels: { position: 'absolute', left: 12, right: 12, top: 2, flexDirection: 'row', justifyContent: 'space-between' },
  labelTxt: { color: '#d7d7d7', fontSize: 10 },
});

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Image, Pressable, ActivityIndicator, Platform } from 'react-native';
import * as MediaLibrary from 'expo-media-library';
import { useAuth } from '../auth/AuthContext';

type AlbumItem = Pick<MediaLibrary.Album, 'id' | 'title' | 'assetCount'> & { coverUri?: string };

export default function AlbumScreen({ navigation }: any) {
  const [albums, setAlbums] = useState<AlbumItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  // Web-only: selected files fallback
  const [webFilesCount, setWebFilesCount] = useState<number>(0);
  const webInputRef = useRef<HTMLInputElement | null>(null);
  const { accessToken } = useAuth();
  const [serverAlbums, setServerAlbums] = useState<Array<{ id: string; title: string; assetsCount: number }>>([]);

  const API_BASE = useMemo(() => {
    const envBase = (process as any).env?.EXPO_PUBLIC_API_BASE as string | undefined;
    return envBase || 'http://localhost:5001';
  }, []);

  async function apiFetch(path: string, init?: RequestInit) {
    const headers: any = { ...(init?.headers || {}) };
    if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;
    return fetch(`${API_BASE}${path}`, { ...init, headers, credentials: 'include' });
  }

  async function createServerAlbum() {
    if (!accessToken) {
      if (Platform.OS === 'web') alert('سجّل الدخول أولًا لإنشاء ألبوم.');
      return;
    }
    const title = `ألبوم ${new Date().toLocaleDateString()}`;
    const res = await apiFetch('/api/media/albums', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }) });
    if (!res.ok) {
      if (Platform.OS === 'web') alert('تعذّر إنشاء الألبوم.');
      return;
    }
    const created = await res.json();
    navigation.navigate('AlbumDetail', { id: created.id, title: created.title });
  }

  // Load server albums so user can re-open after refresh
  useEffect(() => {
    let ignore = false;
    (async () => {
      if (!accessToken) return;
      const res = await apiFetch('/api/media/albums');
      if (!res.ok) return;
      const data = await res.json();
      if (ignore) return;
      setServerAlbums((data || []).map((a: any) => ({ id: a.id, title: a.title, assetsCount: a.assetsCount ?? 0 })));
    })();
    return () => { ignore = true; };
  }, [accessToken]);

  useEffect(() => {
    (async () => {
      try {
        // On web, there is no OS-level gallery permission. Use a file picker instead.
        if (Platform.OS === 'web') {
          setDenied(false);
          setLoading(false);
          return;
        }
        // Request permissions
        const perm = await MediaLibrary.requestPermissionsAsync();
        if (!perm.granted) {
          setDenied(true);
          return;
        }
        // Fetch albums
        const list = await MediaLibrary.getAlbumsAsync();
        // For each album, fetch one asset to use as cover
        const withCovers: AlbumItem[] = [];
        for (const a of list) {
          let coverUri: string | undefined;
          try {
            const assets = await MediaLibrary.getAssetsAsync({ album: a.id, first: 1, mediaType: ['photo', 'video'] });
            coverUri = assets.assets[0]?.uri;
          } catch {}
          withCovers.push({ id: a.id, title: a.title, assetCount: a.assetCount ?? 0, coverUri });
        }
        // Sort by asset count desc
        withCovers.sort((x, y) => (y.assetCount ?? 0) - (x.assetCount ?? 0));
        setAlbums(withCovers);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <View style={styles.container}><ActivityIndicator /><Text style={styles.loadingText}>جارِ تحميل الألبومات…</Text></View>
    );
  }

  if (denied) {
    return (
      <View style={styles.container}>
        <Text style={styles.deniedTitle}>لا صلاحية للوصول إلى الصور</Text>
        {Platform.OS === 'web' ? (
          <Text style={styles.deniedSub}>على الويب لا توجد صلاحية نظامية للصور. استخدم زر اختيار الملفات بالأسفل.</Text>
        ) : (
          <Text style={styles.deniedSub}>أعطِ التطبيق إذن الصور من الإعدادات لعرض الألبومات.</Text>
        )}
        {Platform.OS === 'ios' && <Text style={styles.note}>نصيحة: اختر “الصور المحددة” أو “الكل”.</Text>}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <Text style={styles.topTitle}>ألبومات الجهاز</Text>
        <Pressable style={styles.createBtn} onPress={createServerAlbum}>
          <Text style={styles.createTxt}>+ ألبوم جديد (خادم)</Text>
        </Pressable>
      </View>
      {Platform.OS === 'web' && (
        <View style={styles.webBar}>
          <Text style={styles.webInfo}>الويب: لا يمكن قراءة ألبومات الجهاز مباشرة. اختر صور/فيديو يدويًا.</Text>
          <Pressable style={styles.webButton} onPress={() => webInputRef.current?.click()}>
            <Text style={styles.webButtonText}>اختيار ملفات</Text>
          </Pressable>
          {/* Hidden input element for web file picker */}
          {React.createElement('input', {
            ref: webInputRef as any,
            type: 'file',
            accept: 'image/*,video/*',
            multiple: true,
            style: { display: 'none' },
            onChange: (e: any) => {
              const files: FileList | null = e.target?.files ?? null;
              const count = files ? files.length : 0;
              setWebFilesCount(count);
              if (files && files.length > 0) {
                // Create a pseudo-album with the first file as cover
                const first = files[0];
                const url = URL.createObjectURL(first);
                setAlbums([{ id: 'web-selected', title: 'الملفات المختارة', assetCount: count, coverUri: url }]);
              } else {
                setAlbums([]);
              }
            },
          })}
        </View>
      )}
  <FlatList
        data={albums}
        keyExtractor={(a) => a.id}
        numColumns={2}
        columnWrapperStyle={{ gap: 10 }}
        contentContainerStyle={{ padding: 12, gap: 10 }}
  renderItem={({ item }) => (
    <Pressable style={styles.card}>
            {item.coverUri ? (
              <Image source={{ uri: item.coverUri }} style={styles.cover} />
            ) : (
              <View style={[styles.cover, styles.coverPlaceholder]} />
            )}
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.count}>{item.assetCount} عناصر{Platform.OS === 'web' && item.id === 'web-selected' && webFilesCount ? ` • ${webFilesCount} مختار` : ''}</Text>
          </Pressable>
        )}
        ListEmptyComponent={<Text style={styles.empty}>لا توجد ألبومات.</Text>}
      />

      {/* Server albums section */}
      <View style={styles.serverSection}>
        <Text style={styles.serverTitle}>ألبومات الخادم</Text>
        {serverAlbums.length === 0 ? (
          <Text style={styles.serverEmpty}>لم تُنشئ ألبومات بعد.</Text>
        ) : (
          <View style={{ paddingHorizontal: 12, gap: 10 }}>
            {serverAlbums.map((a) => (
              <Pressable key={a.id} style={styles.serverCard} onPress={() => navigation.navigate('AlbumDetail', { id: a.id, title: a.title })}>
                <Text style={styles.serverCardTitle}>{a.title}</Text>
                <Text style={styles.serverCardSub}>{a.assetsCount} عناصر</Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f1115' },
  loadingText: { marginTop: 8, color: '#fff' },
  deniedTitle: { color: '#fff', fontWeight: '800', fontSize: 18 },
  deniedSub: { color: '#aaa', marginTop: 6 },
  note: { color: '#888', marginTop: 6, fontSize: 12 },
  topBar: { paddingHorizontal: 12, paddingTop: 10, paddingBottom: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  topTitle: { color: '#fff', fontWeight: '800', fontSize: 18 },
  createBtn: { backgroundColor: '#2a67ff', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  createTxt: { color: '#fff', fontWeight: '700' },
  webBar: { paddingHorizontal: 12, paddingVertical: 10, gap: 8, borderBottomColor: '#22262b', borderBottomWidth: 1 },
  webInfo: { color: '#bbb' },
  webButton: { alignSelf: 'flex-start', backgroundColor: '#2a67ff', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  webButtonText: { color: '#fff', fontWeight: '700' },
  card: { flex: 1, backgroundColor: '#1c1f24', borderRadius: 12, overflow: 'hidden' },
  cover: { width: '100%', aspectRatio: 1 },
  coverPlaceholder: { backgroundColor: '#22262b' },
  title: { color: '#fff', fontWeight: '700', paddingHorizontal: 10, paddingTop: 8 },
  count: { color: '#aaa', paddingHorizontal: 10, paddingBottom: 10, paddingTop: 2 },
  empty: { color: '#999', textAlign: 'center', marginTop: 24 },
  serverSection: { borderTopColor: '#22262b', borderTopWidth: 1, paddingTop: 12, marginTop: 8 },
  serverTitle: { color: '#fff', fontWeight: '800', fontSize: 16, paddingHorizontal: 12, marginBottom: 8 },
  serverEmpty: { color: '#999', paddingHorizontal: 12 },
  serverCard: { backgroundColor: '#1c1f24', borderRadius: 10, padding: 12 },
  serverCardTitle: { color: '#fff', fontWeight: '700' },
  serverCardSub: { color: '#aaa', marginTop: 4 },
});

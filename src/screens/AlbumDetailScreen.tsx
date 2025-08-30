import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Image, Pressable, Platform, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../auth/AuthContext';

type Asset = { id: string; uri: string; mime?: string | null; width?: number | null; height?: number | null };

type RouteParams = { id: string; title: string };

export default function AlbumDetailScreen({ route }: any) {
  const { id, title } = route.params as RouteParams;
  const [assets, setAssets] = useState<Asset[]>([]);
  const webInputRef = useRef<HTMLInputElement | null>(null);
  const { accessToken } = useAuth();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();

  const numColumns = 6;
  const gap = 4;

  const API_BASE = useMemo(() => {
    const envBase = (process as any).env?.EXPO_PUBLIC_API_BASE as string | undefined;
    return envBase || 'http://localhost:5001';
  }, []);

  function withBase(uri: string) {
    if (uri.startsWith('http://') || uri.startsWith('https://')) return uri;
    if (uri.startsWith('/uploads/')) return `${API_BASE}${uri}`;
    return uri;
  }

  async function apiFetch(path: string, init?: RequestInit) {
    const headers: any = { ...(init?.headers || {}) };
    if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;
    return fetch(`${API_BASE}${path}`, { ...init, headers, credentials: 'include' });
  }

  async function uploadWeb(files: FileList) {
    const list = Array.from(files);
    for (const file of list) {
      const fd = new FormData();
      fd.append('file', file);
  const res = await apiFetch(`/api/media/albums/${id}/upload`, { method: 'POST', body: fd });
      if (!res.ok) continue;
      const created: Asset = await res.json();
      setAssets((prev) => [created, ...prev]);
    }
  }

  async function uploadNative() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('الإذن مطلوب', 'اسمح للتطبيق بالوصول للصور لرفعها.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 1 });
    if (result.canceled || !result.assets?.length) return;
    const asset = result.assets[0];
    const blob = await (await fetch(asset.uri)).blob();
    const fd = new FormData();
    fd.append('file', blob as any, 'upload.jpg');
    const res = await apiFetch(`/api/media/albums/${id}/upload`, { method: 'POST', body: fd });
    if (!res.ok) return;
    const created: Asset = await res.json();
    setAssets((prev) => [created, ...prev]);
  }

  useEffect(() => {
    let ignore = false;
    (async () => {
      const res = await apiFetch(`/api/media/albums/${id}`);
      if (!res.ok) return;
      const data = await res.json();
      if (ignore) return;
      const list: Asset[] = (data?.assets || []).map((a: any) => ({ id: a.id, uri: withBase(a.uri), mime: a.mime, width: a.width, height: a.height }));
      setAssets(list);
    })();
    return () => { ignore = true; };
  }, [id, accessToken]);

  return (
    <View style={[styles.container, { paddingBottom: Math.max(insets.bottom, 0) }]}> 
      <View style={[styles.header, { paddingTop: 10 + Math.max(insets.top, 0) }]}> 
        <Text style={styles.title}>{title}</Text>
        {Platform.OS === 'web' ? (
          <>
            <Pressable style={styles.uploadBtn} onPress={() => webInputRef.current?.click()}>
              <Text style={styles.uploadTxt}>رفع صور</Text>
            </Pressable>
            {React.createElement('input', {
              ref: webInputRef as any,
              type: 'file',
              accept: 'image/*',
              multiple: true,
              style: { display: 'none' },
              onChange: (e: any) => e.target?.files && uploadWeb(e.target.files as FileList),
            })}
          </>
        ) : (
          <Pressable style={styles.uploadBtn} onPress={uploadNative}>
            <Text style={styles.uploadTxt}>رفع صور</Text>
          </Pressable>
        )}
      </View>

      <FlatList
        data={assets}
        keyExtractor={(a) => a.id}
        numColumns={numColumns}
        contentContainerStyle={{ padding: 8, paddingBottom: (tabBarHeight || 0) + (insets.bottom || 0) + 24 }}
        columnWrapperStyle={{ gap }}
        renderItem={({ item }) => (
          <View style={{ flex: 1 / numColumns }}>
            <Image source={{ uri: withBase(item.uri) }} style={{ width: '100%', aspectRatio: 1, backgroundColor: '#22262b' }} />
          </View>
        )}
        ItemSeparatorComponent={() => <View style={{ height: gap }} />}
        ListEmptyComponent={<Text style={styles.empty}>لا توجد صور بعد.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f1115' },
  header: { paddingHorizontal: 12, paddingTop: 10, paddingBottom: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: '#fff', fontWeight: '800', fontSize: 18 },
  uploadBtn: { backgroundColor: '#2a67ff', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  uploadTxt: { color: '#fff', fontWeight: '700' },
  empty: { color: '#999', textAlign: 'center', marginTop: 24 },
});

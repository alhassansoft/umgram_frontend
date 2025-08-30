import React, { useCallback, useEffect, useState } from 'react';
import { View, StyleSheet, FlatList, RefreshControl, Platform } from 'react-native';
import { Card, Text, Button, ActivityIndicator, Snackbar } from 'react-native-paper';
import { useAuth } from '../auth/AuthContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const LOCAL_BASE = Platform.OS === 'android' ? 'http://10.0.2.2:5001' : 'http://localhost:5001';
const API_BASE = (process.env.EXPO_PUBLIC_API_BASE_URL && process.env.EXPO_PUBLIC_API_BASE_URL.trim())
  ? process.env.EXPO_PUBLIC_API_BASE_URL
  : (process.env.EXPO_PUBLIC_API_BASE && process.env.EXPO_PUBLIC_API_BASE.trim())
    ? process.env.EXPO_PUBLIC_API_BASE
    : LOCAL_BASE;

export default function ConversationsScreen({ navigation }: any) {
  const { accessToken } = useAuth();
  const authHeader = accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined;
  const insets = useSafeAreaInsets();
  const bottomOffset = (insets.bottom || 0) + 64 + 50 + 16;

  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [snack, setSnack] = useState<{visible: boolean; msg: string}>({ visible: false, msg: '' });

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/direct-chat/conversations`, { headers: { ...(authHeader||{}) } });
      if (!res.ok) throw new Error('failed');
      const data = await res.json();
      setItems(Array.isArray(data) ? data : []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }, []);

  const runNow = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/extractions/chat/run-now`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(authHeader||{}) },
      });
      if (!res.ok) throw new Error('failed');
      setSnack({ visible: true, msg: 'تم إرسال مهمة التحليل الآن (قد يستغرق لحظات)...' });
      // Optionally refresh after a small delay
      setTimeout(load, 1500);
    } catch (e) {
      setSnack({ visible: true, msg: 'فشل تشغيل المهمة الآن' });
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        <Text variant="titleLarge" style={{ color: '#fff' }}>الدردشات</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button mode="text" onPress={() => navigation.navigate('ChatSearch')}>بحث</Button>
          <Button mode="outlined" onPress={runNow}>تشغيل التحليل الآن</Button>
          <Button mode="contained" onPress={() => navigation.navigate('Users')}>محادثة جديدة</Button>
        </View>
      </View>
      {loading ? (
        <ActivityIndicator />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(it) => it.id}
          contentContainerStyle={{ paddingBottom: bottomOffset }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          renderItem={({ item }) => (
            <Card mode="elevated" style={styles.card} onPress={() => navigation.navigate('DirectConversation', { id: item.id })}>
              <Card.Title title={`محادثة #${item.id.slice(0, 6)}`} subtitle={(item.updated_at || '').replace('T',' ').slice(0, 16)} />
            </Card>
          )}
          ListEmptyComponent={<Text style={{ color: '#888', textAlign: 'center', marginTop: 16 }}>لا توجد محادثات بعد</Text>}
        />
      )}
      <Snackbar
        visible={snack.visible}
        onDismiss={() => setSnack({ visible: false, msg: '' })}
        duration={2000}
      >
        {snack.msg}
      </Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f1115', padding: 12 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  card: { marginBottom: 8, backgroundColor: '#151a22' },
});

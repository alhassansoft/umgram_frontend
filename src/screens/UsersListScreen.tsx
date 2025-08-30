import React, { useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, FlatList, Pressable, Platform } from 'react-native';
import { Text, Searchbar, Card, Avatar, ActivityIndicator } from 'react-native-paper';
import { useAuth } from '../auth/AuthContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const LOCAL_BASE = 'http://localhost:5001';
const API_BASE = (process.env.EXPO_PUBLIC_API_BASE_URL && process.env.EXPO_PUBLIC_API_BASE_URL.trim())
  ? process.env.EXPO_PUBLIC_API_BASE_URL
  : (process.env.EXPO_PUBLIC_API_BASE && process.env.EXPO_PUBLIC_API_BASE.trim())
    ? process.env.EXPO_PUBLIC_API_BASE
    : (Platform.OS === 'android' ? 'http://10.0.2.2:5001' : LOCAL_BASE);

export default function UsersListScreen({ navigation }: any) {
  const { accessToken } = useAuth();
  const authHeader = accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined;
  const insets = useSafeAreaInsets();
  const bottomOffset = (insets.bottom || 0) + 64 + 50 + 16;
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<any[]>([]);

  const fetchUsers = async (query?: string) => {
    setLoading(true);
    try {
      const u = new URL(`${API_BASE}/api/users`);
      if (query && query.trim()) u.searchParams.set('q', query.trim());
      const res = await fetch(u.toString(), { headers: { ...(authHeader||{} ) } });
      if (!res.ok) throw new Error('Failed to load users');
      const data = await res.json();
      setUsers(Array.isArray(data) ? data : []);
    } catch (e) {
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchUsers(); }, []);

  const onOpenChat = async (peerId: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/direct-chat/open`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(authHeader||{}) },
        body: JSON.stringify({ peerId })
      });
      if (!res.ok) throw new Error('failed to open');
      const data = await res.json();
      navigation.navigate('DirectConversation', { id: data.id });
    } catch {}
  };

  return (
    <View style={styles.container}>
      <Searchbar placeholder="ابحث عن مستخدم" value={q} onChangeText={setQ} onSubmitEditing={() => fetchUsers(q)} style={styles.search} />
      {loading ? <ActivityIndicator /> : (
        <FlatList
          data={users}
          keyExtractor={(u) => u.id}
          contentContainerStyle={{ paddingBottom: bottomOffset }}
          renderItem={({ item }) => (
            <Pressable onPress={() => onOpenChat(item.id)}>
              <Card mode="contained" style={styles.card}>
                <Card.Title title={item.display_name || item.username} subtitle={`انضم: ${(item.created_at||'').slice(0,10)}`} left={(p) => <Avatar.Text {...p} label={(item.display_name||item.username||'?').slice(0,2).toUpperCase()} />} />
              </Card>
            </Pressable>
          )}
          ListEmptyComponent={<Text style={{ color: '#888', textAlign: 'center', marginTop: 16 }}>لا يوجد مستخدمون</Text>}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f1115', padding: 12 },
  search: { marginBottom: 10 },
  card: { marginBottom: 10, backgroundColor: '#151a22' },
});

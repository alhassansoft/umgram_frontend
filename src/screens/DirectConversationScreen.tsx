import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, FlatList, Platform } from 'react-native';
import { Text, TextInput, Button, Card, Chip, ActivityIndicator } from 'react-native-paper';
import { useAuth } from '../auth/AuthContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const LOCAL_BASE = 'http://localhost:5001';
const API_BASE = (process.env.EXPO_PUBLIC_API_BASE_URL && process.env.EXPO_PUBLIC_API_BASE_URL.trim())
  ? process.env.EXPO_PUBLIC_API_BASE_URL
  : (process.env.EXPO_PUBLIC_API_BASE && process.env.EXPO_PUBLIC_API_BASE.trim())
    ? process.env.EXPO_PUBLIC_API_BASE
    : (Platform.OS === 'android' ? 'http://10.0.2.2:5001' : LOCAL_BASE);

export default function DirectConversationScreen({ route }: any) {
  const { id } = route.params || {};
  const { accessToken, user } = useAuth();
  const authHeader = accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined;
  const insets = useSafeAreaInsets();
  // Reserve space for custom floating bottom bar (64) + chips (50) + some gap (16)
  const bottomOffset = (insets.bottom || 0) + 64 + 50 + 16;

  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [summary, setSummary] = useState<{ entities?: string[]; actions?: string[]; time_label?: string | null; polarity?: string | null } | null>(null);

  const load = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/direct-chat/conversations/${id}/messages`, { headers: { ...(authHeader||{}) } });
      if (!res.ok) throw new Error('failed');
      const data = await res.json();
      setMessages(Array.isArray(data) ? data : []);
    } catch {}
  };

  useEffect(() => { load(); }, [id]);

  const loadSummary = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/extractions/chat/conversations/${id}`, { headers: { ...(authHeader||{}) } });
      if (!res.ok) return;
      const data = await res.json();
      const s = data?.extraction?.summary || data; // support both shapes
      setSummary({
        entities: s?.entities || [],
        actions: s?.actions || [],
        time_label: s?.time_label ?? null,
        polarity: s?.polarity ?? null,
      });
    } catch {}
  };

  useEffect(() => { loadSummary(); }, [id]);

  const send = async () => {
    const text = input.trim();
    if (!text) return;
    setInput('');
    try {
      const res = await fetch(`${API_BASE}/api/direct-chat/conversations/${id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(authHeader||{}) },
        body: JSON.stringify({ text })
      });
      if (!res.ok) throw new Error('failed');
      await load();
    } catch {}
  };

  const analyzeNow = async () => {
    setAnalyzing(true);
    try {
      const res = await fetch(`${API_BASE}/api/extractions/chat/conversations/${id}/rebuild`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(authHeader||{}) },
      });
      if (res.ok) {
        await loadSummary();
      }
    } catch {} finally { setAnalyzing(false); }
  };

  return (
    <View style={styles.container}>
      <Card mode="elevated" style={{ backgroundColor: '#151a22', marginBottom: 8 }}>
        <Card.Title title="تحليل المحادثة (Entities/Actions)" />
        <Card.Content>
          {summary ? (
            <>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                <Text style={{ color: '#aaa' }}>الزمن: {summary.time_label || 'unspecified'}</Text>
                <Text style={{ color: '#aaa' }}>القطبية: {summary.polarity || 'unspecified'}</Text>
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
                {(summary.entities || []).slice(0, 10).map((e) => (
                  <Chip key={`e-${e}`} style={{ backgroundColor: '#202734' }} compact>{e}</Chip>
                ))}
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {(summary.actions || []).slice(0, 10).map((a) => (
                  <Chip key={`a-${a}`} style={{ backgroundColor: '#263147' }} compact>{a}</Chip>
                ))}
              </View>
            </>
          ) : (
            <Text style={{ color: '#888' }}>لا يوجد تحليل بعد.</Text>
          )}
        </Card.Content>
        <Card.Actions>
          <Button mode="contained" onPress={analyzeNow} disabled={analyzing}>
            {analyzing ? 'جاري التحليل…' : 'تحليل الآن'}
          </Button>
        </Card.Actions>
      </Card>
      <FlatList
        data={messages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ paddingVertical: 8, paddingBottom: bottomOffset + 56 }}
        renderItem={({ item }) => (
          <View style={[styles.msgWrap, item.sender_id === user?.id ? styles.msgRight : styles.msgLeft]}>
            <Card mode="elevated" style={[styles.msgCard, item.sender_id === user?.id ? styles.msgMine : styles.msgOther]}>
              <Card.Content>
                <Text style={styles.msgText}>{item.text}</Text>
              </Card.Content>
            </Card>
          </View>
        )}
      />
      <View style={[styles.inputRow, { marginBottom: bottomOffset }]}>
        <TextInput mode="outlined" style={styles.input} value={input} onChangeText={setInput} placeholder="اكتب رسالة" onSubmitEditing={send} />
        <Button mode="contained" onPress={send}>إرسال</Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f1115', padding: 12 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 8 },
  input: { flex: 1 },
  msgWrap: { marginBottom: 10, flexDirection: 'row' },
  msgLeft: { justifyContent: 'flex-start' },
  msgRight: { justifyContent: 'flex-end' },
  msgCard: { maxWidth: '88%' },
  msgMine: { backgroundColor: '#1b2a4a' },
  msgOther: { backgroundColor: '#1f2430' },
  msgText: { color: '#fff', fontSize: 15 },
});

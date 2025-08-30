import React, { useCallback, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, Platform, FlatList } from 'react-native';
import { Text as PaperText, TextInput as PaperTextInput, Button, Card, Chip, ActivityIndicator as PaperActivityIndicator, Divider } from 'react-native-paper';
import { useAuth } from '../auth/AuthContext';

type TimeLabel = 'past' | 'present' | 'future' | 'unspecified';
type PolarityLabel = 'affirmative' | 'negative' | 'unspecified';

interface SearchDoc { title?: string; content?: string; updatedAt?: string; time_label?: TimeLabel; polarity?: PolarityLabel; }
interface SearchHit { _id: string; _score: number; _source: SearchDoc; highlight?: Record<string, string[]>; }
interface SelectorCandidate { id: string; score: number; verdict: 'yes' | 'maybe' | 'no'; reason: string; evidence: { snippets: string[]; fields: Array<string>; }; }
interface SelectorAnswer { id: string; answer_text: string; confidence: number }
interface SelectorFinal { type: 'direct' | 'multi' | 'none'; text: string }
interface SelectorResult { question: string; considered_count: number; candidates: SelectorCandidate[]; answers: SelectorAnswer[]; final: SelectorFinal; }

type SourceType = 'diary' | 'note';

const LOCAL_BASE = Platform.OS === 'android' ? 'http://10.0.2.2:5001' : 'http://localhost:5001';
const API_BASE = (process.env.EXPO_PUBLIC_API_BASE_URL && process.env.EXPO_PUBLIC_API_BASE_URL.trim())
  ? process.env.EXPO_PUBLIC_API_BASE_URL
  : (process.env.EXPO_PUBLIC_API_BASE && process.env.EXPO_PUBLIC_API_BASE.trim())
    ? process.env.EXPO_PUBLIC_API_BASE
    : LOCAL_BASE;
const CHAT_BASE = `${API_BASE}/api/chat`;

type MsgRole = 'user' | 'assistant';
type ChatMsg = { id: string; role: MsgRole; text: string; meta?: { answersCount?: number; type?: string; source?: SourceType; hits?: SearchHit[] } };

export default function ChatScreen() {
  const { accessToken } = useAuth();
  const authHeader = accessToken ? ({ Authorization: `Bearer ${accessToken}` } as Record<string, string>) : undefined;

  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<'wide' | 'strict'>('wide');
  const [source, setSource] = useState<SourceType>('diary');
  const [sending, setSending] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  // Simple in-memory cache to avoid re-analyzing identical questions in same app session
  const answerCache = useRef(new Map<string, { text: string; hits: SearchHit[]; type?: string; answersCount?: number }>());

  const ensureSession = useCallback(async (titleHint?: string) => {
    if (sessionId) return sessionId;
    const title = (titleHint || '').slice(0, 60);
    const res = await fetch(`${CHAT_BASE}/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(authHeader || {}) },
      body: JSON.stringify({ title: title || undefined }),
    });
    if (!res.ok) throw new Error('فشل إنشاء جلسة');
    const data = await res.json();
    setSessionId(data.id);
    return data.id as string;
  }, [sessionId, authHeader]);

  const onSend = useCallback(async () => {
    const q = input.trim();
    if (!q || sending) return;
    setSending(true);
    const userMsg: ChatMsg = { id: `${Date.now()}-u`, role: 'user', text: q };
    const thinking: ChatMsg = { id: `${Date.now()}-a`, role: 'assistant', text: '…', meta: { source } };
    setMessages((m) => [...m, userMsg, thinking]);

    try {
      // If we already answered this exact question with same mode+source, reuse cached result
      const cacheKey = `${source}|${mode}|${q.toLowerCase()}`;
      const cached = answerCache.current.get(cacheKey);
      if (cached) {
        setMessages((m) => m.map((msg) => (msg.id === thinking.id ? {
          ...msg,
          text: cached.text,
          meta: { ...msg.meta, hits: cached.hits, type: cached.type, answersCount: cached.answersCount }
        } : msg)));
        return;
      }

      // Ensure a persistent chat session
      const sid = await ensureSession(q);
      // Ask via server-side two-step (search + answer selection)
      const askRes = await fetch(`${CHAT_BASE}/sessions/${sid}/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(authHeader || {}) },
        body: JSON.stringify({ question: q, source, mode }),
      });
      if (!askRes.ok) throw new Error(`فشل السؤال (${askRes.status})`);
      const payload: { assistant?: { text?: string }; selection?: SelectorResult; hits?: SearchHit[] } = await askRes.json();
      const sel = payload.selection as SelectorResult | undefined;
      const hits = (payload.hits ?? []) as SearchHit[];
      const text = payload.assistant?.text || sel?.final?.text || sel?.answers?.[0]?.answer_text || '—';
      setMessages((m) => m.map((msg) => (msg.id === thinking.id ? {
        ...msg,
        text,
        meta: { ...msg.meta, hits, type: sel?.final?.type, answersCount: sel?.answers?.length }
      } : msg)));
      // Save to cache for future identical queries
      answerCache.current.set(cacheKey, { text, hits, type: sel?.final?.type, answersCount: sel?.answers?.length });
    } catch (e: any) {
      setMessages((m) => m.map((msg) => (msg.id === thinking.id ? { ...msg, text: e?.message || 'تعذّر الحصول على إجابة' } : msg)));
    } finally {
      setInput('');
      setSending(false);
    }
  }, [input, mode, source, sending, ensureSession, authHeader]);

  return (
    <View style={styles.container}>
      <Card mode="elevated" style={styles.controlsCard}>
        <Card.Content>
          <View style={styles.controlsRow}>
            <View style={styles.chipsRow}>
              <Chip selected={source === 'diary'} onPress={() => setSource('diary')} style={styles.chip}>Diaries</Chip>
              <Chip selected={source === 'note'} onPress={() => setSource('note')} style={styles.chip}>Notes</Chip>
            </View>
            <View style={styles.chipsRow}>
              <Chip selected={mode === 'wide'} onPress={() => setMode('wide')} style={styles.chip}>واسع</Chip>
              <Chip selected={mode === 'strict'} onPress={() => setMode('strict')} style={styles.chip}>صارم</Chip>
            </View>
          </View>
          <View style={styles.inputRow}>
            <PaperTextInput
              mode="outlined"
              style={styles.input}
              placeholder={source === 'note' ? 'اسأل عن الملاحظات…' : 'اسأل عن المذكرات…'}
              value={input}
              onChangeText={setInput}
              onSubmitEditing={onSend}
              returnKeyType="send"
              editable={!sending}
            />
            <Button mode="contained" onPress={onSend} disabled={sending || !input.trim()}>إرسال</Button>
          </View>
        </Card.Content>
      </Card>

      <FlatList
        data={messages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ paddingVertical: 8 }}
        renderItem={({ item }) => (
          <View style={[styles.msgWrap, item.role === 'user' ? styles.msgRight : styles.msgLeft]}>
            <Card mode="elevated" style={[styles.msgCard, item.role === 'user' ? styles.msgUser : styles.msgAssistant]}>
              <Card.Content>
                <PaperText style={styles.msgText}>{item.text}</PaperText>
                {item.role === 'assistant' && !!item.meta?.type && (
                  <PaperText style={styles.metaText}>type: {item.meta.type} — sources: {item.meta.answersCount ?? 0}</PaperText>
                )}
              </Card.Content>
              {item.role === 'assistant' && !!item.meta?.hits?.length && (
                <>
                  <Divider />
                  <Card.Content>
                    <PaperText style={styles.sourcesTitle}>أهم النتائج</PaperText>
                    {item.meta.hits.slice(0, 3).map((h) => (
                      <View key={h._id} style={{ marginTop: 6 }}>
                        <PaperText style={styles.sourceTitle}>{h._source?.title || 'بدون عنوان'}</PaperText>
                        {!!h._source?.content && (
                          <PaperText style={styles.sourceSnippet} numberOfLines={2}>{h._source.content}</PaperText>
                        )}
                      </View>
                    ))}
                  </Card.Content>
                </>
              )}
            </Card>
          </View>
        )}
        ListEmptyComponent={(
          <View style={{ alignItems: 'center', marginTop: 24 }}>
            {sending ? <PaperActivityIndicator /> : <PaperText style={{ color: '#888' }}>ابدأ بسؤال حول {source === 'note' ? 'الملاحظات' : 'المذكرات'}</PaperText>}
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f1115', padding: 12 },
  controlsCard: { marginBottom: 12, backgroundColor: '#161a22' },
  controlsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  chipsRow: { flexDirection: 'row', alignItems: 'center' },
  chip: { marginRight: 8 },
  inputRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10, gap: 10 },
  input: { flex: 1 },

  msgWrap: { marginBottom: 10, flexDirection: 'row' },
  msgLeft: { justifyContent: 'flex-start' },
  msgRight: { justifyContent: 'flex-end' },
  msgCard: { maxWidth: '88%' },
  msgUser: { backgroundColor: '#1b2a4a' },
  msgAssistant: { backgroundColor: '#1f2430' },
  msgText: { color: '#fff', fontSize: 15 },
  metaText: { marginTop: 6, color: '#9bd' },
  sourcesTitle: { marginTop: 6, color: '#9bd', fontWeight: '700' },
  sourceTitle: { color: '#fff', fontWeight: '700' },
  sourceSnippet: { color: '#cfcfcf' },
});

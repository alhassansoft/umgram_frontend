import React, { useRef, useState } from 'react';
import { View, StyleSheet, TextInput, FlatList, Platform, TouchableOpacity, ActivityIndicator, Text } from 'react-native';
import { useAuth } from '../auth/AuthContext';

const LOCAL_BASE = Platform.OS === 'android' ? 'http://10.0.2.2:5001' : 'http://localhost:5001';
const API_BASE = (process.env.EXPO_PUBLIC_API_BASE_URL && process.env.EXPO_PUBLIC_API_BASE_URL.trim())
  ? process.env.EXPO_PUBLIC_API_BASE_URL
  : (process.env.EXPO_PUBLIC_API_BASE && process.env.EXPO_PUBLIC_API_BASE.trim())
    ? process.env.EXPO_PUBLIC_API_BASE
    : LOCAL_BASE;

type TimeLabel = 'past' | 'present' | 'future' | 'unspecified';
type PolarityLabel = 'affirmative' | 'negative' | 'unspecified';
type SearchMode = 'wide' | 'strict';

type SearchDoc = {
  title?: string;
  content?: string;
  updatedAt?: string;
  time_label?: TimeLabel;
  polarity?: PolarityLabel;
  entities?: string[];
  actions?: string[];
  phrases_en?: string[];
  affirmed_actions_en?: string[];
  negated_actions_en?: string[];
};
type SearchHit = {
  _id: string;
  _score: number;
  _source: SearchDoc;
  highlight?: Record<string, string[]>;
};

type SelectorAnswer = { id: string; answer_text: string; confidence: number };
type SelectorFinal = { type: 'direct' | 'multi' | 'none'; text: string };
type SelectorResult = {
  question: string;
  considered_count: number;
  candidates: any[];
  answers: SelectorAnswer[];
  final: SelectorFinal;
};

export default function ChatSearchScreen() {
  const { accessToken } = useAuth();
  const authHeader = accessToken ? ({ Authorization: `Bearer ${accessToken}` } as Record<string, string>) : undefined;

  const [q, setQ] = useState('');
  const [mode, setMode] = useState<SearchMode>('wide');
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [results, setResults] = useState<SearchHit[]>([]);
  const [answer, setAnswer] = useState<SelectorResult | null>(null);
  const answerCacheRef = useRef(new Map<string, SelectorResult>());

  async function runServerAnswerSelector(question: string, hits: SearchHit[], mode: SearchMode): Promise<SelectorResult | null> {
    try {
      const res = await fetch(`${API_BASE}/api/search/chat/answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(authHeader || {}) },
        body: JSON.stringify({ question, mode, hits }),
      });
      if (!res.ok) {
        const msg = await safeText(res as any);
        throw new Error(`answer selection failed (${res.status}): ${msg}`);
      }
      const data = await res.json();
      return data as SelectorResult;
    } catch {
      return null;
    }
  }

  const onSearch = async () => {
    if (!q.trim()) return;
    try {
      setSearching(true);
      setSearchError(null);
      setResults([]);
      setAnswer(null);
      const url = `${API_BASE}/api/search/chat?q=${encodeURIComponent(q.trim())}&mode=${mode}`;
      const res = await fetch(url, { headers: authHeader });
      if (!res.ok) {
        const msg = await safeText(res);
        throw new Error(`Search failed (${res.status}): ${msg}`);
      }
      const data = await res.json();
      const hits = (data?.hits ?? []) as SearchHit[];
      setResults(hits);
      const cacheKey = `${mode}|${q.trim().toLowerCase()}`;
      const cached = answerCacheRef.current.get(cacheKey);
      if (cached) {
        setAnswer(cached);
      } else {
        const sel = await runServerAnswerSelector(q.trim(), hits.slice(0, 10), mode);
        if (sel) answerCacheRef.current.set(cacheKey, sel);
        setAnswer(sel);
      }
    } catch (e: any) {
      setSearchError(e?.message ?? 'فشل البحث');
    } finally {
      setSearching(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.header}>بحث الدردشة</Text>

      <View style={styles.searchWrap}>
        <View style={styles.searchRow}>
          <TextInput
            style={styles.searchInput}
            placeholder="اكتب عبارة البحث (مثال: I dont want to play futbal)"
            value={q}
            onChangeText={setQ}
            editable={!searching}
          />
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => setMode((m) => (m === 'wide' ? 'strict' : 'wide'))}
            style={[styles.modeBtn, mode === 'strict' && { backgroundColor: '#0b5ed7' }]}
            disabled={searching}
          >
            <Text style={[styles.modeBtnText, mode === 'strict' && { color: '#fff' }]}>
              {mode === 'wide' ? 'واسع' : 'صارم'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={onSearch}
            style={styles.searchBtn}
            disabled={searching}
          >
            {searching ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.searchBtnText}>بحث</Text>
            )}
          </TouchableOpacity>
        </View>

        {searchError ? <Text style={styles.errorText}>{searchError}</Text> : null}

        {answer ? (
          <View style={styles.answerWrap}>
            <Text style={styles.answerTitle}>الجواب المقترح</Text>
            <Text style={styles.answerText}>{answer.final?.text || '—'}</Text>
            {answer.answers?.length ? (
              <Text style={styles.answerMeta}>
                مصادر ({answer.answers.length}): {answer.answers.map(a => a.id).join(', ')}
              </Text>
            ) : null}
          </View>
        ) : null}

        {results.length > 0 ? (
          <View style={{ marginTop: 10 }}>
            <Text style={styles.resultsHeader}>النتائج ({results.length}) — النمط: {mode === 'wide' ? 'واسع' : 'صارم'}</Text>
            {results.slice(0, 10).map((h) => (
              <View key={h._id} style={styles.resultItem}>
                <Text style={styles.resultTitle} numberOfLines={2}>{h._source?.title || 'محادثة'}</Text>
                <Text style={styles.resultMeta}>
                  {_formatDate(h._source?.updatedAt)}
                  {typeof h._score === 'number' ? `  •  score ${h._score.toFixed(2)}` : ''}
                </Text>
                <Text style={styles.resultSnippet} numberOfLines={3}>
                  {excerpt(h._source?.content || '')}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

async function safeText(res: Response) {
  try {
    return await res.text();
  } catch {
    return '';
  }
}

function excerpt(s: string, n = 180) {
  const t = (s || '').replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n) + '…' : t;
}

function _formatDate(iso?: string) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return '';
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#fff' },
  header: { fontSize: 24, fontWeight: 'bold', marginBottom: 6, textAlign: 'center' },
  // شريط البحث
  searchWrap: { marginBottom: 10 },
  searchRow: { flexDirection: 'row', alignItems: 'center' },
  searchInput: { flex: 1, borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 10, marginRight: 8 },
  modeBtn: { paddingHorizontal: 10, paddingVertical: 10, borderRadius: 8, backgroundColor: '#e9f0ff', marginRight: 8 },
  modeBtnText: { color: '#0b5ed7', fontWeight: '700' },
  searchBtn: { backgroundColor: '#111', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8 },
  searchBtnText: { color: '#fff', fontWeight: '700' },
  resultsHeader: { fontSize: 14, fontWeight: '700', color: '#333' },
  resultItem: { marginTop: 8, padding: 10, backgroundColor: '#f9fafb', borderRadius: 8, borderWidth: StyleSheet.hairlineWidth, borderColor: '#e5e7eb' },
  resultTitle: { fontSize: 16, fontWeight: '700', color: '#111' },
  resultMeta: { marginTop: 2, fontSize: 12, color: '#777' },
  resultSnippet: { marginTop: 6, fontSize: 14, color: '#333' },
  // Answer card
  answerWrap: { marginTop: 10, padding: 12, backgroundColor: '#eefcf3', borderRadius: 8, borderWidth: StyleSheet.hairlineWidth, borderColor: '#d3f4e1' },
  answerTitle: { fontSize: 14, fontWeight: '800', color: '#0b6b43', marginBottom: 4 },
  answerText: { fontSize: 16, fontWeight: '700', color: '#0b6b43' },
  answerMeta: { marginTop: 6, fontSize: 12, color: '#246b50' },
  errorText: { color: '#c00', textAlign: 'center', marginTop: 8 },
});

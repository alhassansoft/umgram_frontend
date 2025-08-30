import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, Platform, FlatList, TouchableOpacity, Text, TextInput, ActivityIndicator } from 'react-native';
import { IconButton } from 'react-native-paper';
import { useAuth } from '../auth/AuthContext';

// Shared types (top-level so helpers can use them)
type TimeLabel = 'past' | 'present' | 'future' | 'unspecified';
type PolarityLabel = 'affirmative' | 'negative' | 'unspecified';
type SearchDoc = {
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
type SearchHit = { _id: string; _score: number; _source: SearchDoc; highlight?: Record<string, string[]> };
type SelectorCandidate = { id: string; score: number; verdict: 'yes'|'maybe'|'no'; reason: string; evidence: { snippets: string[]; fields: Array<'content'|'phrases_en'|'entities'|'actions'|'affirmed_actions_en'|'negated_actions_en'|'polarity'|'time_label'> } };
type SelectorAnswer = { id: string; answer_text: string; confidence: number };
type SelectorFinal = { type: 'direct'|'multi'|'none'; text: string };
type SelectorResult = { question: string; considered_count: number; candidates: SelectorCandidate[]; answers: SelectorAnswer[]; final: SelectorFinal };
type Extraction = { entities: string[]; actions: string[]; attributes: string[]; inquiry: string; time?: TimeLabel; polarity?: PolarityLabel };

const LOCAL_BASE = Platform.OS === 'android' ? 'http://10.0.2.2:5001' : 'http://localhost:5001';
const API_BASE = (process.env.EXPO_PUBLIC_API_BASE_URL && process.env.EXPO_PUBLIC_API_BASE_URL.trim())
  ? process.env.EXPO_PUBLIC_API_BASE_URL
  : (process.env.EXPO_PUBLIC_API_BASE && process.env.EXPO_PUBLIC_API_BASE.trim())
    ? process.env.EXPO_PUBLIC_API_BASE
    : LOCAL_BASE;

type Post = {
  id: string;
  text: string;
  createdAt: string;
  user: { id: string; username: string; avatarUrl?: string };
  likes: number;
  replies: number;
  liked?: boolean;
};

export default function MicroblogScreen() {
  const { user, accessToken } = useAuth();
  const authHeader = useMemo(() => (
    accessToken ? ({ Authorization: `Bearer ${accessToken}` } as Record<string, string>) : undefined
  ), [accessToken]);

  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [composer, setComposer] = useState('');
  const [posting, setPosting] = useState(false);
  const [snack, setSnack] = useState<{ visible: boolean; msg: string }>({ visible: false, msg: '' });
  // Search (simple) + Per-post analysis state
  const [q, setQ] = useState('');
  const [mode, setMode] = useState<'wide' | 'strict'>('wide');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<SearchHit[]>([]);
  const [answer, setAnswer] = useState<SelectorResult | null>(null);
  const answerCacheRef = useRef(new Map<string, SelectorResult>());
  // Per-post analysis cache by post id (always visible like Diaries)
  const [analysisByPost, setAnalysisByPost] = useState<Record<string, { loading?: boolean; error?: string | null; data?: Extraction | null }>>({});
  const [extractBusy, setExtractBusy] = useState<Record<string, boolean>>({});

  // types moved to top-level

  const me = useMemo(() => ({
    id: user?.id || 'me',
    username: user?.username || 'Me',
  }), [user]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/microblog/posts`, { headers: { ...(authHeader || {}) } });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      const mapped: Post[] = (Array.isArray(data) ? data : []).map((p: any) => ({
        id: String(p.id),
        text: String(p.text || ''),
        createdAt: String(p.createdAt || new Date().toISOString()),
        user: { id: String(p.user?.id || 'u'), username: String(p.user?.username || 'User') },
        likes: Number(p.likes || 0),
        replies: Number(p.replies || 0),
        liked: !!p.liked,
      }));
  setPosts(mapped);
  // Prefetch first 10 analyses to render tags quickly
  const firstIds = mapped.slice(0, 10).map((p) => p.id);
  firstIds.forEach((id) => { void fetchAnalysis(id); });
    } catch (e: any) {
      // Fallback demo data
      setPosts([{
        id: 'demo-' + Date.now(),
        text: 'أول منشور تجريبي — اكتب شيئًا جديدًا! ✨',
        createdAt: new Date().toISOString(),
        user: { id: me.id, username: me.username },
        likes: 0,
        replies: 0,
        liked: false,
      }]);
    } finally {
      setLoading(false);
    }
  }, [API_BASE, authHeader, me.id, me.username]);
  // Guard against repeated calls due to changing function identity or dev double-invocation
  const didLoadRef = useRef(false);
  useEffect(() => {
    if (didLoadRef.current) return;
    didLoadRef.current = true;
    load();
  }, [load]);

  const onPost = async () => {
    const txt = composer.trim();
    if (!txt) return;
    setPosting(true);
    try {
      // optimistic insert
      const optimistic: Post = {
        id: 'temp-' + Date.now(),
        text: txt,
        createdAt: new Date().toISOString(),
        user: { id: me.id, username: me.username },
        likes: 0,
        replies: 0,
        liked: false,
      };
      setPosts((p) => [optimistic, ...p]);
      setComposer('');

      const res = await fetch(`${API_BASE}/api/microblog/posts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(authHeader || {}) },
        body: JSON.stringify({ text: txt }),
      });
      if (res.ok) {
        const created = await res.json();
        setPosts((p) => p.map((it) => it.id === optimistic.id ? {
          id: String(created.id || it.id),
          text: String(created.text || it.text),
          createdAt: String(created.createdAt || it.createdAt),
          user: { id: String(created.user?.id || me.id), username: String(created.user?.username || me.username) },
          likes: Number(created.likes || 0),
          replies: Number(created.replies || 0),
          liked: !!created.liked,
        } : it));
      } else {
        // keep optimistic post
        setSnack({ visible: true, msg: 'تم النشر محليًا (بدون خادم)' });
      }
    } catch {
      setSnack({ visible: true, msg: 'تعذّر النشر الآن' });
    } finally {
      setPosting(false);
    }
  };

  const fetchAnalysis = useCallback(async (postId: string) => {
    setAnalysisByPost((s) => ({ ...s, [postId]: { ...(s[postId] || {}), loading: true, error: null } }));
    try {
      const res = await fetch(`${API_BASE}/api/extractions/microblog/${encodeURIComponent(postId)}`, { headers: { ...(authHeader || {}) } });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      setAnalysisByPost((s) => ({ ...s, [postId]: { ...(s[postId] || {}), loading: false, data, error: null } }));
    } catch (e: any) {
      setAnalysisByPost((s) => ({ ...s, [postId]: { ...(s[postId] || {}), loading: false, error: 'تعذّر جلب التحليل', data: s[postId]?.data ?? null } }));
    }
  }, [API_BASE, authHeader]);

  const triggerRebuild = async (postId: string) => {
    try {
      setExtractBusy((m) => ({ ...m, [postId]: true }));
      const url = `${API_BASE}/api/extractions/microblog/${encodeURIComponent(postId)}/rebuild`;
      const res = await fetch(url, { method: 'POST', headers: authHeader });
      // ignore non-OK silently like Diaries, but try refresh
      void fetchAnalysis(postId);
      return res.ok;
    } catch {
      return false;
    } finally {
      setExtractBusy((m) => ({ ...m, [postId]: false }));
    }
  };

  const doSearchAndAnswer = async () => {
    const queryText = q.trim();
    if (!queryText) return;
    setSearching(true);
    setAnswer(null);
    setResults([]);
    try {
      const url = `${API_BASE}/api/search/microblog?q=${encodeURIComponent(queryText)}&mode=${encodeURIComponent(mode)}`;
      const res = await fetch(url, { headers: authHeader });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      const hits: SearchHit[] = Array.isArray(data?.hits) ? data.hits : [];
      setResults(hits);
      // Answer selection with caching (question+mode)
      const cacheKey = `${mode}|${queryText.toLowerCase()}`;
      const cached = answerCacheRef.current.get(cacheKey);
      if (cached) {
        setAnswer(cached);
      } else {
        const sel = await runServerAnswerSelector(queryText, hits.slice(0, 10), mode);
        if (sel) answerCacheRef.current.set(cacheKey, sel);
        setAnswer(sel);
      }
    } catch {
      setSnack({ visible: true, msg: 'تعذّر تنفيذ البحث' });
    } finally {
      setSearching(false);
    }
  };

  async function runServerAnswerSelector(question: string, hits: SearchHit[], modeIn: 'wide'|'strict') {
    try {
      const res = await fetch(`${API_BASE}/api/search/microblog/answer`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...(authHeader || {}) },
        body: JSON.stringify({ question, mode: modeIn, hits })
      });
      if (!res.ok) return null;
      const data = (await res.json()) as SelectorResult;
      return data;
    } catch {
      return null;
    }
  }

  const toggleLike = async (id: string) => {
    setPosts((p) => p.map((it) => it.id === id ? { ...it, liked: !it.liked, likes: it.liked ? (it.likes - 1) : (it.likes + 1) } : it));
    try {
      const res = await fetch(`${API_BASE}/api/microblog/posts/${encodeURIComponent(id)}/like`, { method: 'POST', headers: { ...(authHeader || {}) } });
      if (!res.ok) throw new Error('HTTP ' + res.status);
    } catch {
      // revert on failure
      setPosts((p) => p.map((it) => it.id === id ? { ...it, liked: !it.liked, likes: it.liked ? (it.likes - 1) : (it.likes + 1) } : it));
    }
  };

  return (
    <View style={styles.container}>
      {/* Composer */}
      <View style={styles.composerCard}>
        <Text style={styles.header}>اكتب منشوراً</Text>
        <TextInput
          style={styles.input}
          placeholder="بم تفكر؟"
          value={composer}
          onChangeText={setComposer}
          maxLength={280}
          multiline
        />
        <View style={styles.composerRow}>
          <Text style={styles.counter}>{composer.length}/280</Text>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={onPost}
            disabled={posting || !composer.trim()}
            style={[styles.modalBtn, (posting || !composer.trim()) && { opacity: 0.6 }]}
          >
            {posting ? <ActivityIndicator color="#fff" /> : <Text style={styles.modalBtnText}>نشر</Text>}
          </TouchableOpacity>
        </View>
      </View>

      {/* Search (parity with Diaries: single button + caching) */}
      <View style={styles.searchWrap}>
        <View style={styles.searchRow}>
          <TextInput
            style={styles.searchInput}
            placeholder="ابحث في الميكروبلاق..."
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
            onPress={doSearchAndAnswer}
            style={styles.searchBtn}
            disabled={searching || !q.trim()}
          >
            {searching ? <ActivityIndicator color="#fff" /> : <Text style={styles.searchBtnText}>بحث</Text>}
          </TouchableOpacity>
        </View>
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
                <Text style={styles.resultTitle} numberOfLines={2}>منشور</Text>
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

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size={32} />
        </View>
      ) : posts.length === 0 ? (
        <Text style={styles.emptyText}>لا توجد منشورات بعد</Text>
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(it) => it.id}
          contentContainerStyle={{ paddingBottom: 24 }}
          renderItem={({ item }) => {
            const x = analysisByPost[item.id]?.data;
            const xBusy = !!extractBusy[item.id];
            return (
              <View style={styles.item}>
                <View style={styles.row}>
                  <Text style={styles.title} numberOfLines={1}>@{item.user.username}</Text>
                  <Text style={styles.date}>{new Date(item.createdAt).toLocaleString()}</Text>
                </View>
                <Text style={styles.content}>{item.text}</Text>

                <View style={styles.aiRow}>
                  <Text style={styles.aiTitle}>الذكاء:</Text>
                  <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={async () => { await triggerRebuild(item.id); }}
                    style={[styles.aiBtn]}
                    disabled={xBusy}
                  >
                    {xBusy ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={styles.aiBtnText}>تحديث الذكاء</Text>
                    )}
                  </TouchableOpacity>
                </View>

                {analysisByPost[item.id]?.loading ? (
                  <ActivityIndicator size="small" />
                ) : x ? (
                  <View style={styles.tagsWrap}>
                    {renderTimePolarity(x)}
                    {x.entities?.length ? (
                      <TagRow label="كيانات" items={x.entities} />
                    ) : null}
                    {x.actions?.length ? (
                      <TagRow label="أفعال" items={x.actions} />
                    ) : null}
                    {x.attributes?.length ? (
                      <TagRow label="صفات" items={x.attributes} />
                    ) : null}
                    {x.inquiry ? (
                      <Text style={styles.inquiry} numberOfLines={2}>{x.inquiry}</Text>
                    ) : null}
                  </View>
                ) : (
                  <Text style={styles.noAIHint}>لا توجد بيانات ذكاء بعد.</Text>
                )}

                {/* Actions */}
                <View style={[styles.row, { marginTop: 8, justifyContent: 'flex-start' }]}>
                  <TouchableOpacity onPress={() => toggleLike(item.id)} style={{ marginRight: 12 }}>
                    <Text style={{ fontSize: 16 }}>{item.liked ? '❤️' : '🤍'} {item.likes}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setSnack({ visible: true, msg: 'الردود قادمة...' })} style={{ marginRight: 12 }}>
                    <Text style={{ fontSize: 16 }}>💬 {item.replies}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          }}
          ListEmptyComponent={<Text style={{ color: '#888', textAlign: 'center', marginTop: 16 }}>لا توجد منشورات بعد</Text>}
        />
      )}

      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      {/* Simple snack imitation */}
      {snack.visible ? (
        <View style={{ position: 'absolute', bottom: 20, left: 20, right: 20, backgroundColor: '#333', padding: 12, borderRadius: 8 }}>
          <Text style={{ color: '#fff', textAlign: 'center' }}>{snack.msg}</Text>
        </View>
      ) : null}
    </View>
  );
}

function TagRow({ label, items }: { label: string; items: string[] }) {
  return (
    <View style={{ marginTop: 8 }}>
      <Text style={styles.tagLabel}>{label}</Text>
      <View style={styles.tagRow}>
        {items.map((t, i) => (
          <View key={`${t}-${i}`} style={styles.tag}>
            <Text style={styles.tagText}>{t}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function renderTimePolarity(x?: { time?: TimeLabel; polarity?: PolarityLabel }) {
  if (!x) return null;
  const timeLabel = toArabicTime(x.time);
  const polarityLabel = toArabicPolarity(x.polarity);
  if (!timeLabel && !polarityLabel) return null;
  return (
    <View style={{ marginTop: 6 }}>
      <View style={styles.tagRow}>
        {timeLabel ? (
          <View style={[styles.tag, styles.tagTime]}><Text style={[styles.tagText, styles.tagTimeText]}>{timeLabel}</Text></View>
        ) : null}
        {polarityLabel ? (
          <View style={[styles.tag, styles.tagPolarity]}><Text style={[styles.tagText, styles.tagPolarityText]}>{polarityLabel}</Text></View>
        ) : null}
      </View>
    </View>
  );
}

function toArabicTime(t?: TimeLabel) {
  switch (t) {
    case 'past':
      return 'زمن: الماضي';
    case 'present':
      return 'زمن: الحاضر';
    case 'future':
      return 'زمن: المستقبل';
    default:
      return null;
  }
}

function toArabicPolarity(p?: PolarityLabel) {
  switch (p) {
    case 'affirmative':
      return 'الجملة: إثبات';
    case 'negative':
      return 'الجملة: نفي';
    default:
      return null;
  }
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
  header: { fontSize: 18, fontWeight: 'bold', marginBottom: 6 },
  composerCard: { backgroundColor: '#f2f2f2', marginBottom: 8, padding: 12, borderRadius: 8 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 10, marginBottom: 10, fontSize: 16 },
  composerRow: { marginTop: 4, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  counter: { color: '#666' },

  // Search styles (copied from Diaries look & feel)
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
  answerWrap: { marginTop: 10, padding: 12, backgroundColor: '#eefcf3', borderRadius: 8, borderWidth: StyleSheet.hairlineWidth, borderColor: '#d3f4e1' },
  answerTitle: { fontSize: 14, fontWeight: '800', color: '#0b6b43', marginBottom: 4 },
  answerText: { fontSize: 16, fontWeight: '700', color: '#0b6b43' },
  answerMeta: { marginTop: 6, fontSize: 12, color: '#246b50' },

  emptyText: { textAlign: 'center', color: '#888', marginTop: 16, fontSize: 16 },
  item: { marginBottom: 16, padding: 12, backgroundColor: '#f2f2f2', borderRadius: 8 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 16, fontWeight: 'bold', flexShrink: 1, paddingRight: 8 },
  content: { fontSize: 16, marginTop: 4 },
  date: { fontSize: 12, color: '#888', marginTop: 4 },
  tagsWrap: { marginTop: 6 },

  aiRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'flex-start', marginTop: 10 },
  aiTitle: { marginLeft: 8, color: '#333', fontWeight: '700' },
  aiBtn: { backgroundColor: '#111', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, marginRight: 8 },
  aiBtnText: { color: '#fff', fontWeight: '700' },
  noAIHint: { color: '#666', marginTop: 6, fontStyle: 'italic' },

  // tags (parity with Diaries)
  tagLabel: { fontSize: 13, color: '#333', marginBottom: 4, fontWeight: '700' },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap' },
  tag: { backgroundColor: '#eef3ff', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, marginRight: 6, marginBottom: 6 },
  tagText: { color: '#0b5ed7', fontWeight: '700' },
  tagTime: { backgroundColor: '#e8fff6' },
  tagTimeText: { color: '#0f9d58', fontWeight: '800' },
  tagPolarity: { backgroundColor: '#fff3f3' },
  tagPolarityText: { color: '#c62828', fontWeight: '800' },
  inquiry: { marginTop: 6, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8, backgroundColor: '#fff7e6', color: '#8a5300', fontWeight: '600' },

  // Reuse modal-style button look for composer submit
  modalBtn: { backgroundColor: '#007bff', padding: 10, borderRadius: 8, minWidth: 80, alignItems: 'center' },
  modalBtnText: { color: '#fff', fontWeight: 'bold' },
  errorText: { color: '#c00', textAlign: 'center', marginTop: 8 },
});

// src/screens/DiariesScreen.tsx
import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  TextInput,
  Modal,
  RefreshControl,
  Platform,
  TouchableOpacity,
} from 'react-native';
import { useAuth } from '../auth/AuthContext';
import {
  Text as PaperText,
  TextInput as PaperTextInput,
  Button,
  Card,
  Chip,
  ActivityIndicator as PaperActivityIndicator,
  FAB,
  Portal,
  Dialog,
} from 'react-native-paper';

interface Diary {
  id: string;
  title: string;
  content: string;
  createdAt: string; // ISO
  updatedAt: string; // ISO
  userId: string;
}

// نتيجة البحث من API /api/search
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

// --- Local answer selection types (client-side, heuristic) ---
type SelectorCandidate = {
  id: string;
  score: number;
  verdict: 'yes' | 'maybe' | 'no';
  reason: string;
  evidence: { snippets: string[]; fields: Array<'content' | 'phrases_en' | 'entities' | 'actions' | 'affirmed_actions_en' | 'negated_actions_en' | 'polarity' | 'time_label'> };
};
type SelectorAnswer = { id: string; answer_text: string; confidence: number };
type SelectorFinal = { type: 'direct' | 'multi' | 'none'; text: string };
type SelectorResult = {
  question: string;
  considered_count: number;
  candidates: SelectorCandidate[];
  answers: SelectorAnswer[];
  final: SelectorFinal;
};

type TimeLabel = 'past' | 'present' | 'future' | 'unspecified';
type PolarityLabel = 'affirmative' | 'negative' | 'unspecified';

interface Extraction {
  entities: string[];
  actions: string[];
  attributes: string[];
  inquiry: string;
  time?: TimeLabel;       // ⬅️ new
  polarity?: PolarityLabel; // ⬅️ new
}

const LOCAL_BASE =
  Platform.OS === 'android' ? 'http://10.0.2.2:5001' : 'http://localhost:5001';
const API_BASE = (process.env.EXPO_PUBLIC_API_BASE_URL && process.env.EXPO_PUBLIC_API_BASE_URL.trim())
  ? process.env.EXPO_PUBLIC_API_BASE_URL
  : (process.env.EXPO_PUBLIC_API_BASE && process.env.EXPO_PUBLIC_API_BASE.trim())
    ? process.env.EXPO_PUBLIC_API_BASE
    : LOCAL_BASE;

const DiariesScreen: React.FC = () => {
  const { user, accessToken } = useAuth();
  const token = accessToken;

  const [diaries, setDiaries] = useState<Diary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [titleInput, setTitleInput] = useState('');
  const [contentInput, setContentInput] = useState('');

  const [extracts, setExtracts] = useState<Record<string, Extraction | undefined>>({});
  const [extractBusy, setExtractBusy] = useState<Record<string, boolean>>({});

  // --- بحث اليوميات (استعلام حر يستدعي /api/search) ---
  const [q, setQ] = useState('');
  const [mode, setMode] = useState<'wide' | 'strict'>('wide');
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [results, setResults] = useState<SearchHit[]>([]);
  const [answer, setAnswer] = useState<SelectorResult | null>(null);
  // Cache answers by question+mode to avoid re-analysis for repeated queries
  const answerCacheRef = useRef(new Map<string, SelectorResult>());

  // Call backend LLM selector
  async function runServerAnswerSelector(question: string, hits: SearchHit[], mode: 'wide'|'strict'):
    Promise<SelectorResult | null> {
    try {
      const res = await fetch(`${API_BASE}/api/search/answer`, {
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
    } catch (e) {
      return null;
    }
  }

  const authHeader = token ? ({ Authorization: `Bearer ${token}` } as Record<string, string>) : undefined;

  const fetchDiaries = useCallback(async () => {
    if (!user || !user.id || !token) {
      setLoading(false);
      setRefreshing(false);
      setError('يرجى تسجيل الدخول أولاً.');
      return;
    }
    try {
      setError(null);
      if (!refreshing) setLoading(true);
      const res = await fetch(`${API_BASE}/api/diary/user/${user.id}`, {
        headers: authHeader,
      });
      if (!res.ok) {
        const msg = await safeText(res);
        throw new Error(`Fetch failed (${res.status}): ${msg}`);
      }
      const data: Diary[] = await res.json();
      setDiaries(data);

      // Prefetch first 10 extractions
      const firstIds = data.slice(0, 10).map((d) => d.id);
      firstIds.forEach((id) => {
        void fetchExtraction(id);
      });
    } catch (e: any) {
      setError(e?.message ?? 'حدث خطأ أثناء الجلب');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user, token, refreshing]);

  useEffect(() => {
    fetchDiaries();
  }, [fetchDiaries]);

  const onRefresh = () => setRefreshing(true);
  useEffect(() => {
    if (refreshing) fetchDiaries();
  }, [refreshing, fetchDiaries]);

  const openAddModal = () => {
    setEditingId(null);
    setTitleInput('');
    setContentInput('');
    setModalVisible(true);
  };

  const openEditModal = (d: Diary) => {
    setEditingId(d.id);
    setTitleInput(d.title);
    setContentInput(d.content);
    setModalVisible(true);
  };

  const handleSave = async () => {
    if (!titleInput.trim()) return;
    if (!user || !user.id || !token) {
      setError('يرجى تسجيل الدخول أولاً.');
      return;
    }
    try {
      setSubmitting(true);
      setError(null);

      if (editingId) {
        const res = await fetch(`${API_BASE}/api/diary/${editingId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            ...authHeader,
          },
          body: JSON.stringify({
            title: titleInput.trim(),
            content: contentInput.trim(),
          }),
        });
        if (!res.ok) {
          const msg = await safeText(res);
          throw new Error(`Update failed (${res.status}): ${msg}`);
        }
        await triggerRebuild(extractBusy, setExtractBusy, editingId, authHeader);
        await fetchExtraction(editingId);
      } else {
        const res = await fetch(`${API_BASE}/api/diary`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...authHeader,
          },
          body: JSON.stringify({
            title: titleInput.trim(),
            content: contentInput.trim(),
            userId: user.id,
          }),
        });
        if (!res.ok) {
          const msg = await safeText(res);
          throw new Error(`Create failed (${res.status}): ${msg}`);
        }
        const created: Diary = await res.json();
        await triggerRebuild(extractBusy, setExtractBusy, created.id, authHeader);
        await fetchExtraction(created.id);
      }

      setModalVisible(false);
      setEditingId(null);
      setTitleInput('');
      setContentInput('');
      fetchDiaries();
    } catch (e: any) {
      setError(e?.message ?? 'تعذّر حفظ المذكرة');
    } finally {
      setSubmitting(false);
    }
  };

  const askDelete = (id: string) => setConfirmId(id);

  const doDelete = async () => {
    if (!confirmId) return;
    const id = confirmId;
    if (!token) {
      setError('يرجى تسجيل الدخول أولاً.');
      return;
    }
    try {
      setBusyId(id);
      setError(null);

      setDiaries((curr) => curr.filter((d) => String(d.id) !== String(id)));

      const url = `${API_BASE}/api/diary/${id}`;
      const res = await fetch(url, {
        method: 'DELETE',
        headers: authHeader,
      });

      if (!(res.status === 204 || res.ok)) {
        const msg = await safeText(res);
        throw new Error(`Delete failed (${res.status}): ${msg}`);
      }

      setExtracts((curr) => {
        const next = { ...curr };
        delete next[id];
        return next;
      });

      setConfirmId(null);
    } catch (e: any) {
      setError(e?.message ?? 'تعذّر حذف المذكرة');
      setDiaries((_) => [...diaries]);
    } finally {
      setBusyId(null);
    }
  };

  const triggerRebuild = async (
    busyMap: Record<string, boolean>,
    setBusyMap: React.Dispatch<React.SetStateAction<Record<string, boolean>>>,
    id: string,
    headers?: Record<string, string>
  ) => {
    try {
      setBusyMap((m) => ({ ...m, [id]: true }));
      const url = `${API_BASE}/api/extractions/diary/${id}/rebuild`;
      const res = await fetch(url, { method: 'POST', headers });
      if (!res.ok && res.status !== 404) {
        const msg = await safeText(res);
        throw new Error(`Rebuild failed (${res.status}): ${msg}`);
      }
    } catch {
      // ignore
    } finally {
      setBusyMap((m) => ({ ...m, [id]: false }));
    }
  };

  const fetchExtraction = useCallback(
    async (id: string) => {
      try {
        setExtractBusy((m) => ({ ...m, [id]: true }));
        const url = `${API_BASE}/api/extractions/diary/${id}`;
        const res = await fetch(url, { headers: authHeader });
        if (!res.ok) return; // 404 = لا يوجد استخراج بعد
        const data = (await res.json()) as Extraction;
        setExtracts((curr) => ({ ...curr, [id]: data }));
      } catch {
        // ignore
      } finally {
        setExtractBusy((m) => ({ ...m, [id]: false }));
      }
    },
    [token]
  );

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <PaperActivityIndicator animating size={32} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.header}>مذكّراتي</Text>

      {/* شريط البحث الدلالي */}
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
            onPress={async () => {
              if (!q.trim()) return;
              try {
                setSearching(true);
                setSearchError(null);
                setResults([]);
                setAnswer(null);
                const url = `${API_BASE}/api/search?q=${encodeURIComponent(q.trim())}&mode=${mode}`;
                const res = await fetch(url, { headers: authHeader });
                if (!res.ok) {
                  const msg = await safeText(res);
                  throw new Error(`Search failed (${res.status}): ${msg}`);
                }
                const data = await res.json();
                const hits = (data?.hits ?? []) as SearchHit[];
                setResults(hits);
                // Answer selection with caching (question+mode)
                const cacheKey = `${mode}|${q.trim().toLowerCase()}`;
                const cached = answerCacheRef.current.get(cacheKey);
                if (cached) {
                  setAnswer(cached);
                } else {
                  const sel = await runServerAnswerSelector(q.trim(), hits.slice(0, 10), mode);
                  if (sel) {
                    answerCacheRef.current.set(cacheKey, sel);
                  }
                  setAnswer(sel);
                }
              } catch (e: any) {
                setSearchError(e?.message ?? 'فشل البحث');
              } finally {
                setSearching(false);
              }
            }}
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
            <Text style={styles.answerText}>{answer.final.text || '—'}</Text>
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
                <Text style={styles.resultTitle} numberOfLines={2}>{h._source?.title || 'بدون عنوان'}</Text>
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

      {!user?.id ? (
        <Text style={styles.errorText}>يرجى تسجيل الدخول لعرض المذكرات.</Text>
      ) : null}

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <TouchableOpacity
        activeOpacity={0.75}
        onPress={openAddModal}
        disabled={!user?.id || !token}
        style={[styles.addButton, (!user?.id || !token) && { opacity: 0.6 }]}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Text style={styles.addButtonText}>إضافة مذكرة جديدة</Text>
      </TouchableOpacity>

      {diaries.length === 0 ? (
        <Text style={styles.emptyText}>لا توجد مذكرات بعد.</Text>
      ) : (
        <FlatList
          data={diaries}
          keyExtractor={(item) => String(item.id)}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          renderItem={({ item }) => {
            const isBusy = busyId === item.id;
            const xBusy = !!extractBusy[item.id];
            const x = extracts[item.id];

            return (
              <View style={styles.item}>
                <View style={styles.row}>
                  <Text style={styles.title} numberOfLines={2}>
                    {item.title}
                  </Text>
                  <View
                    style={[
                      styles.actionRow,
                      Platform.OS === 'web' ? ({ pointerEvents: 'box-none' } as any) : null,
                    ]}
                    {...(Platform.OS !== 'web' ? { pointerEvents: 'box-none' as const } : {})}
                  >
                    <TouchableOpacity
                      activeOpacity={0.7}
                      onPress={() => openEditModal(item)}
                      disabled={isBusy}
                      style={[styles.actionBtn, isBusy && { opacity: 0.5 }]}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Text style={styles.actionText}>تعديل</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      activeOpacity={0.7}
                      onPress={() => setConfirmId(item.id)}
                      disabled={isBusy}
                      style={[styles.actionBtn, styles.deleteBtn, isBusy && { opacity: 0.5 }]}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      {isBusy ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Text style={[styles.actionText, { color: '#fff' }]}>حذف</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>

                <Text style={styles.content}>{item.content}</Text>
                <Text style={styles.date}>
                  {new Date(item.createdAt).toLocaleString()}
                </Text>

                {/* شريط الذكاء */}
                <View style={styles.aiRow}>
                  <Text style={styles.aiTitle}>الذكاء:</Text>
                  <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={async () => {
                      await triggerRebuild(extractBusy, setExtractBusy, item.id, authHeader);
                      await fetchExtraction(item.id);
                    }}
                    style={[styles.aiBtn]}
                    disabled={xBusy}
                  >
                    {xBusy ? (
                      <ActivityIndicator size="small" />
                    ) : (
                      <Text style={styles.aiBtnText}>تحديث الذكاء</Text>
                    )}
                  </TouchableOpacity>
                </View>

                {x ? (
                  <View style={styles.tagsWrap}>
                    {/* time & polarity chips (if specified) */}
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
                      <Text style={styles.inquiry} numberOfLines={2}>
                        {x.inquiry}
                      </Text>
                    ) : null}
                  </View>
                ) : (
                  <Text style={styles.noAIHint}>لا توجد بيانات ذكاء بعد.</Text>
                )}
              </View>
            );
          }}
        />
      )}

      {/* مودال تأكيد الحذف */}
      <Modal visible={!!confirmId} transparent animationType="fade">
        <View style={styles.confirmWrap}>
          <View style={styles.confirmBox}>
            <Text style={styles.confirmTitle}>تأكيد الحذف</Text>
            <Text style={styles.confirmText}>هل تريد حذف هذه المذكرة؟</Text>
            <View style={styles.confirmActions}>
              <TouchableOpacity
                activeOpacity={0.8}
                style={[styles.confirmBtn, { backgroundColor: '#ccc' }]}
                onPress={() => setConfirmId(null)}
              >
                <Text style={[styles.confirmBtnText, { color: '#333' }]}>إلغاء</Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.8}
                style={[styles.confirmBtn, { backgroundColor: '#dc3545' }]}
                onPress={doDelete}
              >
                <Text style={styles.confirmBtnText}>حذف</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* مودال إضافة/تعديل */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalWrap}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>
              {editingId ? 'تعديل المذكرة' : 'إضافة مذكرة'}
            </Text>
            <TextInput
              style={styles.input}
              placeholder="العنوان"
              value={titleInput}
              onChangeText={setTitleInput}
              editable={!submitting}
            />
            <TextInput
              style={[styles.input, { height: 100 }]}
              placeholder="المحتوى"
              value={contentInput}
              onChangeText={setContentInput}
              multiline
              editable={!submitting}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                activeOpacity={0.75}
                onPress={handleSave}
                disabled={submitting}
                style={[styles.modalBtn, submitting && { opacity: 0.6 }]}
              >
                {submitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.modalBtnText}>حفظ</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.75}
                onPress={() => {
                  if (!submitting) {
                    setModalVisible(false);
                    setEditingId(null);
                  }
                }}
                disabled={submitting}
                style={[styles.modalBtn, { backgroundColor: '#ccc' }]}
              >
                <Text style={[styles.modalBtnText, { color: '#333' }]}>إلغاء</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

// --- Helpers & small components ------------------------------------------------

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

function renderTimePolarity(x: Extraction) {
  const timeLabel = toArabicTime(x.time);
  const polarityLabel = toArabicPolarity(x.polarity);

  if (!timeLabel && !polarityLabel) return null;

  return (
    <View style={{ marginTop: 6 }}>
      <View style={styles.tagRow}>
        {timeLabel ? (
          <View style={[styles.tag, styles.tagTime]}>
            <Text style={[styles.tagText, styles.tagTimeText]}>{timeLabel}</Text>
          </View>
        ) : null}
        {polarityLabel ? (
          <View style={[styles.tag, styles.tagPolarity]}>
            <Text style={[styles.tagText, styles.tagPolarityText]}>{polarityLabel}</Text>
          </View>
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

// Removed local heuristic selector to rely on server-side LLM selection

// --- Styles -------------------------------------------------------------------

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#fff' },
  header: { fontSize: 24, fontWeight: 'bold', marginBottom: 6, textAlign: 'center' },
  addButton: { backgroundColor: '#007bff', padding: 12, borderRadius: 8, marginBottom: 16 },
  addButtonText: { color: '#fff', fontWeight: 'bold', textAlign: 'center' },
  errorText: { color: '#c00', textAlign: 'center', marginBottom: 8 },
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
  emptyText: { textAlign: 'center', color: '#888', marginTop: 32, fontSize: 16 },
  item: { marginBottom: 16, padding: 12, backgroundColor: '#f2f2f2', borderRadius: 8 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 18, fontWeight: 'bold', flexShrink: 1, paddingRight: 8 },
  content: { fontSize: 16, marginTop: 4 },
  date: { fontSize: 12, color: '#888', marginTop: 8 },

  actionRow: { flexDirection: 'row', alignItems: 'center' },
  actionBtn: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2a2f36',
    backgroundColor: '#e9f0ff',
    marginLeft: 8,
  },
  actionText: { fontWeight: '700', color: '#0b5ed7' },
  deleteBtn: { backgroundColor: '#dc3545', borderColor: '#dc3545' },

  aiRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'flex-start', marginTop: 10 },
  aiTitle: { marginLeft: 8, color: '#333', fontWeight: '700' },
  aiBtn: { backgroundColor: '#111', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, marginRight: 8 },
  aiBtnText: { color: '#fff', fontWeight: '700' },
  noAIHint: { color: '#666', marginTop: 6, fontStyle: 'italic' },

  tagsWrap: { marginTop: 6 },
  tagLabel: { fontSize: 13, color: '#333', marginBottom: 4, fontWeight: '700' },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap' },
  tag: {
    backgroundColor: '#eef3ff',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    marginRight: 6,
    marginBottom: 6,
  },
  tagText: { color: '#0b5ed7', fontWeight: '700' },

  // time/polarity variants
  tagTime: { backgroundColor: '#e8fff6' },
  tagTimeText: { color: '#0f9d58', fontWeight: '800' },
  tagPolarity: { backgroundColor: '#fff3f3' },
  tagPolarityText: { color: '#c62828', fontWeight: '800' },

  // ✅ ستايل الجملة العربية (inquiry)
  inquiry: {
    marginTop: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#fff7e6',
    color: '#8a5300',
    fontWeight: '600',
  },

  confirmWrap: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', alignItems: 'center' },
  confirmBox: { width: '85%', backgroundColor: '#fff', borderRadius: 12, padding: 18 },
  confirmTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 8, textAlign: 'center' },
  confirmText: { fontSize: 15, color: '#333', textAlign: 'center' },
  confirmActions: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 16 },
  confirmBtn: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 10, minWidth: 100, alignItems: 'center' },
  confirmBtnText: { color: '#fff', fontWeight: '700' },

  modalWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.2)' },
  modalBox: { backgroundColor: '#fff', padding: 20, borderRadius: 12, width: '90%' },
  modalTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 12, textAlign: 'center' },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 10, marginBottom: 10, fontSize: 16 },
  modalActions: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 },
  modalBtn: { backgroundColor: '#007bff', padding: 10, borderRadius: 8, minWidth: 80, alignItems: 'center' },
  modalBtnText: { color: '#fff', fontWeight: 'bold' },
});

export default DiariesScreen;

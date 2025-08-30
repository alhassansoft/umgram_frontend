import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TextInput, TouchableOpacity, FlatList, Modal, ScrollView } from 'react-native';
import { useAuth } from '../auth/AuthContext';

interface Note {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  userId: string;
}

// LLM answer selection result types (mirrors backend schema)
type SelectorCandidate = {
  id: string;
  score: number;
  verdict: 'yes' | 'maybe' | 'no';
  reason: string;
  evidence: { snippets: string[]; fields: string[] };
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

const LOCAL_BASE = 'http://localhost:5001';
const API_BASE = (process.env.EXPO_PUBLIC_API_BASE_URL && process.env.EXPO_PUBLIC_API_BASE_URL.trim())
  ? process.env.EXPO_PUBLIC_API_BASE_URL
  : (process.env.EXPO_PUBLIC_API_BASE && process.env.EXPO_PUBLIC_API_BASE.trim())
    ? process.env.EXPO_PUBLIC_API_BASE
    : LOCAL_BASE;

const NotesScreen: React.FC = () => {
  const { user, accessToken } = useAuth();
  const token = accessToken;
  const authHeader = token ? ({ Authorization: `Bearer ${token}` } as Record<string, string>) : undefined;

  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [titleInput, setTitleInput] = useState('');
  const [contentInput, setContentInput] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [busyExtract, setBusyExtract] = useState<Record<string, boolean>>({});

  // search state
  const [q, setQ] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchHits, setSearchHits] = useState<any[] | null>(null);
  const [answer, setAnswer] = useState<SelectorResult | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  // extraction viewer state
  const [extractModalNoteId, setExtractModalNoteId] = useState<string | null>(null);
  const [extractData, setExtractData] = useState<any | null>(null);
  const [loadingExtract, setLoadingExtract] = useState(false);

  const fetchNotes = useCallback(async () => {
    if (!user || !user.id || !token) {
      setLoading(false);
      setRefreshing(false);
      setError('يرجى تسجيل الدخول أولاً.');
      return;
    }
    try {
      setError(null);
      if (!refreshing) setLoading(true);
      const res = await fetch(`${API_BASE}/api/notes/user/${user.id}`, { headers: authHeader });
      if (!res.ok) throw new Error(`Fetch failed (${res.status})`);
      const data: Note[] = await res.json();
      setNotes(data);
    } catch (e: any) {
      setError(e?.message ?? 'فشل الجلب');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user, token, refreshing]);

  useEffect(() => { fetchNotes(); }, [fetchNotes]);

  const openAdd = () => { setEditingId(null); setTitleInput(''); setContentInput(''); setModalVisible(true); };
  const openEdit = (n: Note) => { setEditingId(n.id); setTitleInput(n.title); setContentInput(n.content); setModalVisible(true); };

  const openExtraction = async (id: string) => {
    try {
      setExtractModalNoteId(id);
      setLoadingExtract(true);
      setExtractData(null);
      const res = await fetch(`${API_BASE}/api/extractions/note/${id}`, { headers: authHeader });
      if (!res.ok) throw new Error(`Fetch extraction failed (${res.status})`);
      const data = await res.json();
      setExtractData(data);
    } catch (e) {
      setExtractData({ error: 'تعذّر جلب الاستخراج' });
    } finally {
      setLoadingExtract(false);
    }
  };

  const runSearch = async () => {
    const query = q.trim();
    if (!query) { setSearchHits(null); setAnswer(null); setSearchError(null); return; }
    try {
      setSearching(true);
      setSearchError(null);
      const url = `${API_BASE}/api/search/note?q=${encodeURIComponent(query)}&mode=strict`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Search failed (${res.status})`);
      const data = await res.json();
      const hits = data?.hits ?? [];
      setSearchHits(hits);

      // Step 2: ask the backend LLM selector to choose an answer from the hits
      try {
        const selRes = await fetch(`${API_BASE}/api/search/note/answer`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question: query, mode: 'strict', hits: hits?.slice?.(0, 10) ?? [] }),
        });
        if (!selRes.ok) throw new Error(`Answer selection failed (${selRes.status})`);
        const sel: SelectorResult = await selRes.json();
        setAnswer(sel);
      } catch (e: any) {
        setAnswer(null);
      }
    } catch (e) {
      setSearchHits([]);
      setAnswer(null);
      setSearchError((e as any)?.message ?? 'فشل البحث');
    } finally {
      setSearching(false);
    }
  };

  const triggerRebuild = async (id: string) => {
    try {
      setBusyExtract((m) => ({ ...m, [id]: true }));
      const url = `${API_BASE}/api/extractions/note/${id}/rebuild`;
      const res = await fetch(url, { method: 'POST', headers: authHeader });
      if (!res.ok && res.status !== 404) {
        const msg = await res.text();
        throw new Error(`Rebuild failed (${res.status}): ${msg}`);
      }
    } catch (e) {
      // ignore for now
    } finally {
      setBusyExtract((m) => ({ ...m, [id]: false }));
    }
  };

  const handleSave = async () => {
    if (!titleInput.trim()) return;
    if (!user || !user.id || !token) { setError('يرجى تسجيل الدخول أولاً.'); return; }
    try {
      setSubmitting(true);
      setError(null);
      if (editingId) {
        const res = await fetch(`${API_BASE}/api/notes/${editingId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...(authHeader || {}) },
          body: JSON.stringify({ title: titleInput.trim(), content: contentInput.trim() }),
        });
        if (!res.ok) throw new Error(`Update failed (${res.status})`);
        await triggerRebuild(editingId);
      } else {
        const res = await fetch(`${API_BASE}/api/notes`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(authHeader || {}) },
          body: JSON.stringify({ title: titleInput.trim(), content: contentInput.trim(), userId: user.id }),
        });
        if (!res.ok) throw new Error(`Create failed (${res.status})`);
        const created: Note = await res.json();
        await triggerRebuild(created.id);
      }
      setModalVisible(false);
      setEditingId(null);
      setTitleInput('');
      setContentInput('');
      fetchNotes();
    } catch (e: any) {
      setError(e?.message ?? 'تعذّر الحفظ');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!token) { setError('يرجى تسجيل الدخول أولاً.'); return; }
    try {
      const res = await fetch(`${API_BASE}/api/notes/${id}`, { method: 'DELETE', headers: authHeader });
      if (!(res.status === 204 || res.ok)) throw new Error(`Delete failed (${res.status})`);
      setNotes((curr) => curr.filter((n) => String(n.id) !== String(id)));
    } catch (e: any) {
      setError(e?.message ?? 'تعذّر الحذف');
    }
  };

  if (loading) return <ActivityIndicator style={{ flex: 1 }} size="large" />;

  return (
    <View style={styles.container}>
      <Text style={styles.header}>ملاحظاتي</Text>

      {/* search bar */}
      <View style={styles.searchRow}>
        <TextInput
          style={[styles.input, { flex: 1 }]}
          placeholder="ابحث في الملاحظات (EN semantic)"
          placeholderTextColor="#889"
          value={q}
          onChangeText={setQ}
          onSubmitEditing={runSearch}
          returnKeyType="search"
        />
        <TouchableOpacity style={styles.addBtn} onPress={runSearch} disabled={searching}>
          {searching ? <ActivityIndicator color="#fff" /> : <Text style={styles.addBtnText}>بحث</Text>}
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.addBtn} onPress={openAdd}>
        <Text style={styles.addBtnText}>إضافة</Text>
      </TouchableOpacity>

      {!!error && <Text style={styles.error}>{error}</Text>}

      {!!answer && (
        <View style={styles.answerPanel}>
          <Text style={styles.answerTitle}>الإجابة</Text>
          <Text style={styles.answerText}>
            {answer.final?.text || answer.answers?.[0]?.answer_text || '—'}
          </Text>
          <Text style={styles.answerMeta}>
            considered {answer.considered_count} • type {answer.final?.type}
          </Text>
        </View>
      )}

      {searchHits && (
        <View style={styles.searchPanel}>
          <Text style={styles.searchTitle}>نتائج البحث ({searchHits.length})</Text>
          {!!searchError && <Text style={styles.error}>{searchError}</Text>}
          <FlatList
            data={searchHits}
            keyExtractor={(h) => String(h.id ?? h._id ?? Math.random())}
            renderItem={({ item }) => (
              <View style={styles.item}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemTitle}>{item._source?.title ?? item.title}</Text>
                  {!!(item._source?.content ?? item.content) && (
                    <Text style={styles.itemContent} numberOfLines={2}>{item._source?.content ?? item.content}</Text>
                  )}
                </View>
                <TouchableOpacity onPress={() => openExtraction(String(item._id ?? item.id))}>
                  <Text style={styles.link}>الإستخراج</Text>
                </TouchableOpacity>
              </View>
            )}
          />
        </View>
      )}

      <FlatList
        data={notes}
        keyExtractor={(n) => String(n.id)}
        renderItem={({ item }) => (
          <View style={styles.item}>
            <View style={{ flex: 1 }}>
              <Text style={styles.itemTitle}>{item.title}</Text>
              {!!item.content && <Text style={styles.itemContent} numberOfLines={2}>{item.content}</Text>}
              <Text style={styles.itemHint}>{busyExtract[item.id] ? 'يجري استخراج المعاني…' : 'استخراج المعاني جاهز'}</Text>
            </View>
            <TouchableOpacity onPress={() => openExtraction(item.id)}><Text style={styles.link}>الإستخراج</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => triggerRebuild(item.id)}><Text style={styles.link}>إعادة استخراج</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => openEdit(item)}><Text style={styles.link}>تعديل</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => handleDelete(item.id)}><Text style={[styles.link, { color: '#d33' }]}>حذف</Text></TouchableOpacity>
          </View>
        )}
      />

      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.modalWrap}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{editingId ? 'تعديل' : 'إضافة'} ملاحظة</Text>
            <TextInput style={styles.input} placeholder="العنوان" value={titleInput} onChangeText={setTitleInput} />
            <TextInput style={[styles.input, { height: 100 }]} placeholder="المحتوى" value={contentInput} onChangeText={setContentInput} multiline />
            <View style={styles.modalRow}>
              <TouchableOpacity style={[styles.btn, { backgroundColor: '#666' }]} onPress={() => setModalVisible(false)} disabled={submitting}>
                <Text style={styles.btnText}>إلغاء</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.btn} onPress={handleSave} disabled={submitting}>
                {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>حفظ</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* extraction modal */}
      <Modal visible={!!extractModalNoteId} transparent animationType="fade" onRequestClose={() => setExtractModalNoteId(null)}>
        <View style={styles.modalWrap}>
          <View style={[styles.modalCard, { maxHeight: '80%', width: '100%' }]}>
            <Text style={styles.modalTitle}>مخرجات الإستخراج</Text>
            {loadingExtract ? (
              <ActivityIndicator />
            ) : (
              <ScrollView style={{ maxHeight: 400 }}>
                <Text style={{ color: '#fff', fontFamily: 'monospace' }}>
                  {JSON.stringify(extractData, null, 2)}
                </Text>
              </ScrollView>
            )}
            <View style={styles.modalRow}>
              <TouchableOpacity style={[styles.btn, { backgroundColor: '#666' }]} onPress={() => setExtractModalNoteId(null)}>
                <Text style={styles.btnText}>إغلاق</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

export default NotesScreen;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f1115', padding: 16 },
  header: { color: '#fff', fontSize: 22, fontWeight: '700', marginBottom: 12 },
  addBtn: { alignSelf: 'flex-start', backgroundColor: '#0b5ed7', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, marginBottom: 8 },
  addBtnText: { color: '#fff', fontWeight: '700' },
  error: { color: '#f66', marginBottom: 8 },
  item: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#161a22', padding: 12, borderRadius: 10, marginBottom: 10, gap: 12 },
  itemTitle: { color: '#fff', fontSize: 16, fontWeight: '700' },
  itemContent: { color: '#cfcfcf', marginTop: 4 },
  itemHint: { color: '#8aa', marginTop: 6, fontSize: 12 },
  link: { color: '#0b7dda', fontWeight: '700', marginLeft: 10 },
  modalWrap: { flex: 1, justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.5)', padding: 16 },
  modalCard: { backgroundColor: '#161a22', borderRadius: 12, padding: 16 },
  modalTitle: { color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 12 },
  input: { backgroundColor: '#0f1115', color: '#fff', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 10 },
  modalRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12 },
  btn: { backgroundColor: '#0b5ed7', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 10 },
  btnText: { color: '#fff', fontWeight: '700' },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  searchPanel: { backgroundColor: '#11131a', borderRadius: 10, padding: 10, marginBottom: 10 },
  searchTitle: { color: '#9bd', fontWeight: '700', marginBottom: 6 },
  // answer styles
  answerPanel: { backgroundColor: '#0c2a1b', borderColor: '#145c39', borderWidth: StyleSheet.hairlineWidth, borderRadius: 10, padding: 12, marginBottom: 10 },
  answerTitle: { color: '#8ef5c0', fontWeight: '800', marginBottom: 4 },
  answerText: { color: '#bfffe0', fontWeight: '800', fontSize: 16 },
  answerMeta: { color: '#7bd9ab', marginTop: 6, fontSize: 12 },
});

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, TextInput, FlatList, TouchableOpacity, ActivityIndicator, Platform, KeyboardAvoidingView, Modal, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthContext';

const LOCAL_BASE = Platform.OS === 'android' ? 'http://10.0.2.2:5001' : 'http://localhost:5001';
const API_BASE = (process.env.EXPO_PUBLIC_API_BASE_URL && process.env.EXPO_PUBLIC_API_BASE_URL.trim())
  ? process.env.EXPO_PUBLIC_API_BASE_URL
  : (process.env.EXPO_PUBLIC_API_BASE && process.env.EXPO_PUBLIC_API_BASE.trim())
    ? process.env.EXPO_PUBLIC_API_BASE
    : LOCAL_BASE;

type Mode = 'wide' | 'strict';
type ReplyMode = 'reply' | 'silent' | 'replyAll';
type Message = { id: string; role: 'user'|'assistant'; text: string; createdAt?: string };
type Session = { id: string; title?: string | null; createdAt?: string; updatedAt?: string };

export default function ConfessionScreen() {
  const insets = useSafeAreaInsets();
  const { accessToken } = useAuth();
  const authHeader = useMemo(() => (
    accessToken ? ({ Authorization: `Bearer ${accessToken}` } as Record<string, string>) : undefined
  ), [accessToken]);

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [mode, setMode] = useState<Mode>('wide'); // deprecated for sending; kept for temp only
  const [replyMode, setReplyMode] = useState<ReplyMode>('reply');
  const [showReplyAllHint, setShowReplyAllHint] = useState(false);
  const [extractVisible, setExtractVisible] = useState(false);
  const [extractLoading, setExtractLoading] = useState(false);
  const [extractData, setExtractData] = useState<any | null>(null);
  const listRef = useRef<FlatList<Message>>(null);
  // Match the App.tsx overlay layout: tab bar (64) + chips (50) + gap (8) + safe bottom
  const OVERLAY_HEIGHT = (insets?.bottom || 0) + 64 + 50 + 8;

  const scrollToEnd = () => setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 0);

  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/confession/sessions`, { headers: { ...(authHeader || {}) } });
      if (!res.ok) return;
      const data = await res.json();
      setSessions(Array.isArray(data) ? data : []);
    } catch {}
  }, [API_BASE, authHeader]);

  const createSession = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/confession/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(authHeader || {}) },
        body: JSON.stringify({ title: 'فضفضة' }),
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const conv = await res.json();
      setSessionId(conv.id);
      fetchSessions();
    } catch {
      // leave sessionId null; UI will show error note
    }
  }, [API_BASE, authHeader, fetchSessions]);

  useEffect(() => { fetchSessions(); }, [fetchSessions]);

  useEffect(() => {
    if (!sessionId && sessions.length > 0) {
      setSessionId(sessions[0].id); // auto-select most recent
    }
  }, [sessionId, sessions]);

  const loadMessages = useCallback(async (id: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/confession/sessions/${encodeURIComponent(id)}/messages`, { headers: { ...(authHeader || {}) } });
      if (!res.ok) return;
      const data = await res.json();
      setMessages(Array.isArray(data) ? data : []);
      scrollToEnd();
    } catch {}
  }, [API_BASE, authHeader]);

  useEffect(() => { if (sessionId) loadMessages(sessionId); }, [sessionId, loadMessages]);

  const pendingPreviewText = useMemo(() => {
    if (!sessionId) return '';
    // Find last assistant index in current local list
    let lastAssistantIdx = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i]?.role === 'assistant') { lastAssistantIdx = i; break; }
    }
    const pending = messages.slice(lastAssistantIdx + 1).filter(m => m.role === 'user').map(m => m.text.trim()).filter(Boolean);
    // include current input if any
    if (input.trim()) pending.push(input.trim());
    if (pending.length === 0) return '';
    return pending.map((t, idx) => `${idx + 1}. ${t}`).join('\n');
  }, [messages, input, sessionId]);

  const send = async () => {
    const text = input.trim();
    if (!text || !sessionId || sending) return;
    setSending(true);
    // optimistic user message
    const userMsg: Message = { id: 'u-' + Date.now(), role: 'user', text };
    setMessages((m) => [...m, userMsg]);
    setInput('');
    scrollToEnd();

    try {
  // For replies only; search buttons removed. Keep mapping for reply temperature.
  const temperature = mode === 'strict' ? 0.2 : 0.6;
      if (replyMode === 'reply') {
        // Ask the assistant (server persists both user and assistant messages)
        const res = await fetch(`${API_BASE}/api/confession/sessions/${encodeURIComponent(sessionId)}/ask`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(authHeader || {}) },
          body: JSON.stringify({ message: text, temperature }),
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        const assistantText: string = data?.assistant?.text || '—';
        const assistantMsg: Message = { id: data?.assistant?.id || 'a-' + Date.now(), role: 'assistant', text: assistantText };
        setMessages((m) => [...m, assistantMsg]);
        scrollToEnd();
      } else if (replyMode === 'silent') {
        // No reply: just persist the user's message
        const res = await fetch(`${API_BASE}/api/confession/sessions/${encodeURIComponent(sessionId)}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(authHeader || {}) },
          body: JSON.stringify({ role: 'user', text }),
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
      } else {
        // replyAll: ensure the just-typed message is persisted, then ask for a single combined reply
        const res1 = await fetch(`${API_BASE}/api/confession/sessions/${encodeURIComponent(sessionId)}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(authHeader || {}) },
          body: JSON.stringify({ role: 'user', text }),
        });
        if (!res1.ok) throw new Error('HTTP ' + res1.status);
        const res2 = await fetch(`${API_BASE}/api/confession/sessions/${encodeURIComponent(sessionId)}/replyAll`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(authHeader || {}) },
          body: JSON.stringify({ temperature }),
        });
        if (!res2.ok) throw new Error('HTTP ' + res2.status);
        const data = await res2.json();
        const assistantText: string = data?.assistant?.text || '—';
        const assistantMsg: Message = { id: data?.assistant?.id || 'a-' + Date.now(), role: 'assistant', text: assistantText };
        setMessages((m) => [...m, assistantMsg]);
        scrollToEnd();
      }
    } catch {
      // fallback assistant error bubble
      setMessages((m) => [...m, { id: 'err-' + Date.now(), role: 'assistant', text: 'تعذّر إرسال الرسالة الآن.' }]);
      scrollToEnd();
    } finally {
      setSending(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={OVERLAY_HEIGHT}>
    <View style={[styles.container, { paddingBottom: OVERLAY_HEIGHT }]}>
      <Text style={styles.header}>فضفضة — تحدّث بحرية</Text>

      {/* Session picker */}
      <View style={styles.sessionBar}>
        <FlatList
          data={sessions}
          horizontal
          keyExtractor={(s) => s.id}
          contentContainerStyle={{ paddingVertical: 6, gap: 8 }}
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() => setSessionId(item.id)}
              style={[styles.sessionPill, sessionId === item.id && styles.sessionPillActive]}
            >
              <Text style={[styles.sessionPillText, sessionId === item.id && styles.sessionPillTextActive]}>
                {item.title?.trim() || `جلسة ${item.id.slice(0, 4)}`}
              </Text>
            </TouchableOpacity>
          )}
          ListFooterComponent={
            <TouchableOpacity onPress={createSession} style={styles.newBtn}>
              <Text style={styles.newBtnText}>+ جلسة جديدة</Text>
            </TouchableOpacity>
          }
        />
      </View>

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ paddingVertical: 8 }}
        renderItem={({ item }) => (
          <View style={[styles.bubble, item.role === 'user' ? styles.bubbleUser : styles.bubbleAssistant]}>
            <Text style={item.role === 'user' ? styles.bubbleUserText : styles.bubbleAssistantText}>{item.text}</Text>
          </View>
        )}
        ListEmptyComponent={sessionId ? (
          <Text style={styles.hint}>اكتب أي شيء لتبدأ الفضفضة…</Text>
        ) : null}
      />

      <View style={styles.composerRow}>
  {/* Reply mode segmented buttons */}
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <TouchableOpacity
            onPress={() => setReplyMode('reply')}
            style={[styles.modeBtn, replyMode === 'reply' && { backgroundColor: '#16a34a', borderColor: '#16a34a' }]}
            disabled={sending}
          >
            <Text style={[styles.modeBtnText, replyMode === 'reply' && { color: '#fff' }]}>رد</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setReplyMode('silent')}
            style={[styles.modeBtn, replyMode === 'silent' && { backgroundColor: '#6b7280', borderColor: '#6b7280' }]}
            disabled={sending}
          >
            <Text style={[styles.modeBtnText, replyMode === 'silent' && { color: '#fff' }]}>بدون رد</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setReplyMode('replyAll')}
            style={[styles.modeBtn, replyMode === 'replyAll' && { backgroundColor: '#0ea5e9', borderColor: '#0ea5e9' }]}
            disabled={sending}
          >
            <Text style={[styles.modeBtnText, replyMode === 'replyAll' && { color: '#fff' }]}>رد على الكل</Text>
          </TouchableOpacity>
        </View>
        {replyMode === 'replyAll' && (
          <TouchableOpacity
            onPress={() => setShowReplyAllHint((s) => !s)}
            style={[styles.modeBtn, { backgroundColor: '#f1f5f9', borderColor: '#e2e8f0' }]}
            disabled={sending}
          >
            <Text style={[styles.modeBtnText]}>معاينة</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          onPress={async () => {
            if (!sessionId) return;
            try {
              setExtractVisible(true);
              setExtractLoading(true);
              setExtractData(null);
              const res = await fetch(`${API_BASE}/api/confession/sessions/${encodeURIComponent(sessionId)}/extraction`, { headers: { ...(authHeader || {}) } });
              if (res.status === 404) {
                // Try rebuild then fetch
                await fetch(`${API_BASE}/api/confession/sessions/${encodeURIComponent(sessionId)}/extraction/rebuild`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(authHeader || {}) } });
                const res2 = await fetch(`${API_BASE}/api/confession/sessions/${encodeURIComponent(sessionId)}/extraction`, { headers: { ...(authHeader || {}) } });
                if (!res2.ok) throw new Error('extract fetch failed');
                setExtractData(await res2.json());
              } else if (res.ok) {
                setExtractData(await res.json());
              } else {
                throw new Error('extract fetch failed');
              }
            } catch {
              setExtractData({ error: 'تعذّر جلب الإستخراج' });
            } finally {
              setExtractLoading(false);
            }
          }}
          style={[styles.modeBtn, { backgroundColor: '#0b5ed7', borderColor: '#0b5ed7' }]}
          disabled={sending}
        >
          <Text style={[styles.modeBtnText, { color: '#fff' }]}>الإستخراج</Text>
        </TouchableOpacity>
        <TextInput
          style={styles.input}
          placeholder="اكتب هنا مشكلتك أو سؤالك…"
          value={input}
          onChangeText={setInput}
          editable={!sending}
          multiline
        />
        <TouchableOpacity onPress={send} disabled={!input.trim() || sending} style={[styles.sendBtn, (!input.trim() || sending) && { opacity: 0.6 }]}>
          {sending ? <ActivityIndicator color="#fff" /> : <Text style={styles.sendBtnText}>إرسال</Text>}
        </TouchableOpacity>
      </View>
      {replyMode === 'replyAll' && showReplyAllHint && !!pendingPreviewText && (
        <View style={{ marginTop: 6, backgroundColor: '#091016', borderColor: '#1f2937', borderWidth: StyleSheet.hairlineWidth, borderRadius: 8, padding: 8 }}>
          <Text style={{ color: '#9ca3af', fontSize: 12 }}>سيتم الرد على النص التالي كرسالة واحدة:</Text>
          <Text style={{ color: '#e5e7eb', marginTop: 6, lineHeight: 18 }}>{pendingPreviewText}</Text>
        </View>
      )}

      {/* extraction modal */}
      <Modal visible={extractVisible} transparent animationType="fade" onRequestClose={() => setExtractVisible(false)}>
        <View style={{ flex: 1, justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.5)', padding: 16 }}>
          <View style={{ backgroundColor: '#161a22', borderRadius: 12, padding: 16, maxHeight: '80%' }}>
            <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 12 }}>مخرجات الإستخراج</Text>
            {extractLoading ? (
              <ActivityIndicator />
            ) : (
              <ScrollView style={{ maxHeight: 400 }}>
                <Text style={{ color: '#fff', fontFamily: 'monospace' }}>
                  {JSON.stringify(extractData, null, 2)}
                </Text>
              </ScrollView>
            )}
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 12 }}>
              <TouchableOpacity style={[styles.modeBtn, { backgroundColor: '#666', borderColor: '#666' }]} onPress={() => setExtractVisible(false)}>
                <Text style={[styles.modeBtnText, { color: '#fff' }]}>إغلاق</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modeBtn, { backgroundColor: '#0b5ed7', borderColor: '#0b5ed7' }]}
                onPress={async () => {
                  if (!sessionId) return;
                  try {
                    setExtractLoading(true);
                    await fetch(`${API_BASE}/api/confession/sessions/${encodeURIComponent(sessionId)}/extraction/rebuild`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(authHeader || {}) } });
                    const res = await fetch(`${API_BASE}/api/confession/sessions/${encodeURIComponent(sessionId)}/extraction`, { headers: { ...(authHeader || {}) } });
                    setExtractData(res.ok ? await res.json() : { error: 'تعذّر الجلب بعد إعادة الاستخراج' });
                  } finally { setExtractLoading(false); }
                }}
              >
                <Text style={[styles.modeBtnText, { color: '#fff' }]}>إعادة استخراج</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f1115', padding: 12 },
  header: { color: '#fff', fontSize: 18, fontWeight: '700', textAlign: 'center', marginBottom: 6 },
  center: { alignItems: 'center', justifyContent: 'center', paddingVertical: 16 },
  hint: { color: '#a0a0a0', textAlign: 'center', marginTop: 16 },

  bubble: { maxWidth: '80%', borderRadius: 12, padding: 10, marginVertical: 4, alignSelf: 'flex-start' },
  bubbleUser: { backgroundColor: '#111', alignSelf: 'flex-end' },
  bubbleAssistant: { backgroundColor: '#1c1f24' },
  bubbleUserText: { color: '#fff' },
  bubbleAssistantText: { color: '#e5e7eb' },

  composerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 6 },
  sessionBar: { marginBottom: 6 },
  sessionPill: { backgroundColor: '#1c1f24', borderRadius: 14, paddingVertical: 6, paddingHorizontal: 10 },
  sessionPillActive: { backgroundColor: '#007bff' },
  sessionPillText: { color: '#e5e7eb' },
  sessionPillTextActive: { color: '#fff', fontWeight: '700' },
  newBtn: { backgroundColor: '#111', borderRadius: 14, paddingVertical: 6, paddingHorizontal: 10 },
  newBtnText: { color: '#fff', fontWeight: '700' },
  input: { flex: 1, minHeight: 40, maxHeight: 120, borderWidth: 1, borderColor: '#2a2f36', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, color: '#fff' },
  sendBtn: { backgroundColor: '#007bff', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8 },
  sendBtnText: { color: '#fff', fontWeight: '700' },
  modeBtn: { paddingHorizontal: 10, paddingVertical: 10, borderRadius: 8, backgroundColor: '#f1f2f6', borderWidth: StyleSheet.hairlineWidth, borderColor: '#e5e7eb' },
  modeBtnText: { color: '#111', fontWeight: '700' },
});

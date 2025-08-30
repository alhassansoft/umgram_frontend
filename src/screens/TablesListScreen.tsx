import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, TextInput, Alert, Modal, ActivityIndicator, Platform, TouchableOpacity } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useMemoryTables } from '../state/memoryTables';
import { useAuth } from '../auth/AuthContext';
import { useNavigation } from '@react-navigation/native';

export default function TablesListScreen() {
	const nav = useNavigation<any>();
	const { tables, addTable, deleteTable, renameTable, refresh } = useMemoryTables();
	const { accessToken } = useAuth();
	const [newName, setNewName] = useState('');
	const [colDraft, setColDraft] = useState('');
	const [renameVisible, setRenameVisible] = useState(false);
	const [renameText, setRenameText] = useState('');
	const [renameId, setRenameId] = useState<string | null>(null);
	const [aiPrompt, setAiPrompt] = useState('');
	const [aiBusy, setAiBusy] = useState(false);

	const create = async () => {
		const cols = colDraft
			.split(',')
			.map((s) => s.trim())
			.filter(Boolean);
		const id = await addTable(newName || 'جدول', cols.length ? cols : ['اسم']);
		setNewName('');
		setColDraft('');
		nav.navigate('TableDetail', { id });
	};

		const promptRename = (id: string, current: string) => {
			setRenameId(id);
			setRenameText(current);
			setRenameVisible(true);
		};

		const doRename = async () => {
			if (renameId && renameText.trim()) {
				await renameTable(renameId, renameText.trim());
			}
			setRenameVisible(false);
			setRenameId(null);
			setRenameText('');
		};

	const remove = (id: string) => {
		if (!accessToken) {
			Alert.alert('مطلوب تسجيل الدخول', 'يرجى تسجيل الدخول لحذف الجداول.');
			return;
		}
		// React Native Web: Alert buttons are not supported; use confirm()
		if (Platform.OS === 'web') {
			const ok = typeof globalThis.confirm === 'function'
				? globalThis.confirm('هل أنت متأكد؟ سيتم حذف الصفوف والأعمدة أيضاً.')
				: true;
			if (!ok) return;
			(async () => {
				try {
					await deleteTable(id);
					await refresh();
				} catch (e: any) {
					Alert.alert('خطأ', e?.message || 'فشل حذف الجدول');
				}
			})();
			return;
		}
		Alert.alert('حذف الجدول', 'هل أنت متأكد؟ سيتم حذف الصفوف والأعمدة أيضاً.', [
			{ text: 'إلغاء', style: 'cancel' },
			{
				text: 'حذف',
				style: 'destructive',
				onPress: async () => {
					try {
						await deleteTable(id);
						// Ensure UI sync with server state
						await refresh();
					} catch (e: any) {
						Alert.alert('خطأ', e?.message || 'فشل حذف الجدول');
					}
				},
			},
		]);
	};

	const runAi = async () => {
		if (!aiPrompt.trim()) return;
		try {
			setAiBusy(true);
			// Send to backend AI to plan and apply actions globally (no tableId here)
			const base = (process.env.EXPO_PUBLIC_API_BASE_URL && process.env.EXPO_PUBLIC_API_BASE_URL.trim())
				? process.env.EXPO_PUBLIC_API_BASE_URL
				: (process.env.EXPO_PUBLIC_API_BASE && process.env.EXPO_PUBLIC_API_BASE.trim())
					? process.env.EXPO_PUBLIC_API_BASE
					: (Platform.OS === 'android' ? 'http://10.0.2.2:5001' : 'http://localhost:5001');
			const res = await fetch(`${base}/api/memory/ai/prompt`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
				body: JSON.stringify({ prompt: aiPrompt, apply: true }),
			});
			if (!res.ok) {
				const msg = await res.text();
				throw new Error(`AI failed (${res.status}): ${msg}`);
			}
			const data = await res.json();
			setAiPrompt('');
			await refresh();
			const created = (data?.applied || []).find((x: any) => x.type === 'create_table');
			if (created?.tableId) nav.navigate('TableDetail', { id: created.tableId });
			else Alert.alert('تم', 'نُفّذت التعليمات بواسطة الذكاء الاصطناعي.');
		} catch (e: any) {
			Alert.alert('خطأ', e?.message || 'فشل تنفيذ البرومبت');
		} finally {
			setAiBusy(false);
		}
	};

	return (
		<View style={styles.container}>
			{/* AI prompt bar */}
			<View style={[styles.row, { marginBottom: 8 }]}>
				<TextInput
					placeholder="اكتب برومبت: أنشئ جدول مهام وأضف 3 عناصر..."
					placeholderTextColor="#777"
					value={aiPrompt}
					onChangeText={setAiPrompt}
					style={styles.input}
				/>
				<Pressable onPress={runAi} style={styles.primaryBtn} disabled={aiBusy}>
					{aiBusy ? <ActivityIndicator color="#111" /> : <Ionicons name="sparkles-outline" size={18} color="#111" />}
					<Text style={styles.primaryText}>ذكاء</Text>
				</Pressable>
			</View>
				{/* Rename modal */}
				<Modal visible={renameVisible} transparent animationType="fade" onRequestClose={() => setRenameVisible(false)}>
					<View style={styles.modalWrap}>
						<View style={styles.modalCard}>
							<Text style={styles.modalTitle}>إعادة تسمية الجدول</Text>
							<TextInput
								value={renameText}
								onChangeText={setRenameText}
								placeholder="الاسم الجديد"
								placeholderTextColor="#777"
								style={styles.input}
								autoFocus
							/>
							<View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
								<Pressable onPress={() => setRenameVisible(false)} style={[styles.secondaryBtn]}><Text style={styles.secondaryText}>إلغاء</Text></Pressable>
								<Pressable onPress={doRename} style={[styles.primaryBtn]}>
									<Ionicons name="save-outline" size={18} color="#111" />
									<Text style={styles.primaryText}>حفظ</Text>
								</Pressable>
							</View>
						</View>
					</View>
				</Modal>
			<Text style={styles.title}>جداول الذاكرة</Text>
			<View style={styles.row}>
				<TextInput
					placeholder="اسم الجدول"
					placeholderTextColor="#777"
					value={newName}
					onChangeText={setNewName}
					style={styles.input}
				/>
				<TextInput
					placeholder="أسماء الأعمدة (مفصولة بفاصلة)"
					placeholderTextColor="#777"
					value={colDraft}
					onChangeText={setColDraft}
					style={[styles.input, { flex: 1.4 }]}
				/>
				<Pressable onPress={create} style={styles.primaryBtn}>
					<Ionicons name="add" size={20} color="#111" />
					<Text style={styles.primaryText}>إنشاء</Text>
				</Pressable>
			</View>

			<FlatList
				data={tables}
				keyExtractor={(it) => it.id}
				contentContainerStyle={{ paddingVertical: 8 }}
				renderItem={({ item }) => (
					<View style={styles.card}>
						<Pressable style={{ flex: 1 }} onPress={() => nav.navigate('TableDetail', { id: item.id })}>
							<Text style={styles.cardTitle}>{item.name}</Text>
							<Text style={styles.cardSub}>{item.columns.length} أعمدة • {(item.rowsCount ?? item.rows?.length ?? 0)} صفوف</Text>
						</Pressable>
						<TouchableOpacity onPress={() => promptRename(item.id, item.name)} onLongPress={() => promptRename(item.id, item.name)} activeOpacity={0.6} style={styles.iconBtn} hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }} accessibilityRole="button" accessibilityLabel={`إعادة تسمية ${item.name}`}>
							<Ionicons name="pencil-outline" size={18} color="#ccc" />
						</TouchableOpacity>
						<TouchableOpacity onPress={() => remove(item.id)} onLongPress={() => remove(item.id)} activeOpacity={0.6} style={styles.iconBtn} hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }} accessibilityRole="button" accessibilityLabel={`حذف ${item.name}`}>
							<Ionicons name="trash-outline" size={18} color="#ff6b6b" />
						</TouchableOpacity>
					</View>
				)}
				ListEmptyComponent={<Text style={{ color: '#999', textAlign: 'center', marginTop: 24 }}>لا توجد جداول بعد.</Text>}
			/>
		</View>
	);
}

const styles = StyleSheet.create({
	container: { flex: 1, backgroundColor: '#0f1115', padding: 16 },
	title: { color: '#fff', fontSize: 18, fontWeight: '800', marginBottom: 8 },
	row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
	input: { flex: 1, backgroundColor: '#1c1f24', color: '#fff', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10 },
	primaryBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: '#fff', borderRadius: 10 },
	primaryText: { color: '#111', fontWeight: '800' },
	card: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1c1f24', padding: 12, borderRadius: 12, marginTop: 10 },
	cardTitle: { color: '#fff', fontWeight: '800' },
	cardSub: { color: '#aaa', marginTop: 2 },
	iconBtn: { padding: 10, marginLeft: 8, borderRadius: 8, backgroundColor: 'transparent' },
	modalWrap: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 },
	modalCard: { backgroundColor: '#14171c', borderRadius: 12, padding: 16 },
	modalTitle: { color: '#fff', fontWeight: '800', marginBottom: 8, fontSize: 16 },
	secondaryBtn: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, backgroundColor: '#2a2f37' },
	secondaryText: { color: '#fff', fontWeight: '700' },
});


import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, TextInput, Alert, Modal, ActivityIndicator, Platform } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useRoute, useNavigation } from '@react-navigation/native';
import { useMemoryTables } from '../state/memoryTables';
import { useAuth } from '../auth/AuthContext';

type RouteParams = { id: string };

export default function TableDetailScreen() {
	const route = useRoute<any>();
	const nav = useNavigation<any>();
	const { id } = route.params as RouteParams;
	const { tables, loadTable, addColumn, deleteColumn, renameColumn, addRow, updateRow, deleteRow, renameTable } = useMemoryTables();
	const table = useMemo(() => tables.find((t) => t.id === id), [tables, id]);

	const [colName, setColName] = useState('');
	const [rowDraft, setRowDraft] = useState<Record<string, string>>({});
	const [renameVisible, setRenameVisible] = useState(false);
	const [renameText, setRenameText] = useState('');
	const [renameColId, setRenameColId] = useState<string | null>(null); // null => table rename
	const [aiPrompt, setAiPrompt] = useState('');
	const [aiBusy, setAiBusy] = useState(false);
	const { accessToken } = useAuth();

		useEffect(() => {
			if (!table || !table.rows) {
				loadTable(id);
			}
		}, [id]);

	if (!table) {
		return (
			<View style={styles.container}><Text style={{ color: '#fff' }}>الجدول غير موجود.</Text></View>
		);
	}

	const onAddColumn = async () => {
		if (!colName.trim()) return;
		await addColumn(table.id, colName);
		setColName('');
	};

	const onAddRow = async () => {
		const filled: Record<string, string> = {};
		table.columns.forEach((c) => {
			filled[c.id] = rowDraft[c.id] ?? '';
		});
		await addRow(table.id, filled);
		setRowDraft({});
	};

	const openRenameColumn = (colId: string, current: string) => {
		setRenameColId(colId);
		setRenameText(current);
		setRenameVisible(true);
	};

	const openRenameTable = () => {
		setRenameColId(null);
		setRenameText(table.name);
		setRenameVisible(true);
	};

	const doRename = async () => {
		const text = renameText.trim();
		if (!text) {
			setRenameVisible(false);
			return;
		}
		if (renameColId) {
			await renameColumn(table.id, renameColId, text);
		} else {
			await renameTable(table.id, text);
		}
		setRenameVisible(false);
	};

		const runAi = async () => {
			if (!aiPrompt.trim()) return;
			try {
				setAiBusy(true);
				const base = (process.env.EXPO_PUBLIC_API_BASE_URL && process.env.EXPO_PUBLIC_API_BASE_URL.trim())
					? process.env.EXPO_PUBLIC_API_BASE_URL
					: (process.env.EXPO_PUBLIC_API_BASE && process.env.EXPO_PUBLIC_API_BASE.trim())
						? process.env.EXPO_PUBLIC_API_BASE
						: (Platform.OS === 'android' ? 'http://10.0.2.2:5001' : 'http://localhost:5001');
				const res = await fetch(`${base}/api/memory/ai/prompt`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json', ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
					body: JSON.stringify({ prompt: aiPrompt, tableId: table.id, apply: true }),
				});
				if (!res.ok) {
					const msg = await res.text();
					throw new Error(`AI failed (${res.status}): ${msg}`);
				}
				setAiPrompt('');
				Alert.alert('تم', 'نُفّذت التعليمات على هذا الجدول.');
			} catch (e: any) {
				Alert.alert('خطأ', e?.message || 'فشل تنفيذ البرومبت');
			} finally {
				setAiBusy(false);
			}
		};

	return (
		<View style={styles.container}>
			{/* Rename modal */}
			<Modal visible={renameVisible} transparent animationType="fade" onRequestClose={() => setRenameVisible(false)}>
				<View style={styles.modalWrap}>
					<View style={styles.modalCard}>
						<Text style={styles.modalTitle}>{renameColId ? 'إعادة تسمية العمود' : 'إعادة تسمية الجدول'}</Text>
						<TextInput
							value={renameText}
							onChangeText={setRenameText}
							placeholder={renameColId ? 'اسم العمود الجديد' : 'اسم الجدول الجديد'}
							placeholderTextColor="#777"
							style={styles.input}
							autoFocus
						/>
						<View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
							<Pressable onPress={() => setRenameVisible(false)} style={styles.secondaryBtn}><Text style={styles.secondaryText}>إلغاء</Text></Pressable>
							<Pressable onPress={doRename} style={styles.primaryBtn}><Ionicons name="save-outline" size={18} color="#111" /><Text style={styles.primaryText}>حفظ</Text></Pressable>
						</View>
					</View>
				</View>
			</Modal>
			<View style={styles.headerRow}>
				<Text style={styles.title}>{table.name}</Text>
				<Pressable onPress={openRenameTable} style={styles.iconBtn}><Ionicons name="pencil-outline" size={18} color="#ccc" /></Pressable>
			</View>

			<Text style={styles.section}>الأعمدة</Text>
			<View style={styles.row}>
				<TextInput placeholder="اسم العمود" placeholderTextColor="#777" value={colName} onChangeText={setColName} style={styles.input} />
				<Pressable onPress={onAddColumn} style={styles.primaryBtn}><Ionicons name="add" size={20} color="#111" /><Text style={styles.primaryText}>إضافة</Text></Pressable>
			</View>

			<FlatList
				horizontal
				data={table.columns}
				keyExtractor={(c) => c.id}
				contentContainerStyle={{ paddingVertical: 6 }}
				style={{ maxHeight: 46 }}
				renderItem={({ item }) => (
					<View style={styles.chip}>
						<Text style={styles.chipText}>{item.name}</Text>
						<Pressable onPress={() => openRenameColumn(item.id, item.name)} style={styles.chipIcon}><Ionicons name="pencil-outline" size={14} color="#eee" /></Pressable>
						<Pressable onPress={() => deleteColumn(table.id, item.id)} style={styles.chipIcon}><Ionicons name="close-outline" size={16} color="#ff6b6b" /></Pressable>
					</View>
				)}
				ListEmptyComponent={<Text style={{ color: '#aaa', marginHorizontal: 8 }}>لا توجد أعمدة بعد.</Text>}
			/>

			<Text style={styles.section}>صف جديد</Text>
			<View style={{ gap: 8 }}>
				{table.columns.map((c) => (
					<TextInput
						key={c.id}
						placeholder={c.name}
						placeholderTextColor="#777"
						value={rowDraft[c.id] ?? ''}
						onChangeText={(t) => setRowDraft((prev) => ({ ...prev, [c.id]: t }))}
						style={styles.input}
					/>
				))}
				<Pressable onPress={onAddRow} style={[styles.primaryBtn, { alignSelf: 'flex-start' }]}><Ionicons name="add" size={20} color="#111" /><Text style={styles.primaryText}>إضافة صف</Text></Pressable>
			</View>

			<Text style={[styles.section, { marginTop: 16 }]}>الصفوف</Text>
			<FlatList
				data={table.rows}
				keyExtractor={(r) => r.id}
				renderItem={({ item }) => (
					<View style={styles.rowCard}>
						<View style={{ flex: 1, gap: 6 }}>
							{table.columns.map((c) => (
								<View key={`${item.id}_${c.id}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
									<Text style={{ color: '#aaa', minWidth: 86 }}>{c.name}:</Text>
									<TextInput
										value={item.values[c.id] ?? ''}
										onChangeText={(t) => updateRow(table.id, item.id, { ...item.values, [c.id]: t })}
										style={[styles.input, { flex: 1 }]} />
								</View>
							))}
						</View>
						<Pressable onPress={() => deleteRow(table.id, item.id)} style={styles.iconBtn}><Ionicons name="trash-outline" size={18} color="#ff6b6b" /></Pressable>
					</View>
				)}
				ListEmptyComponent={<Text style={{ color: '#999', textAlign: 'center', marginTop: 8 }}>لا توجد صفوف.</Text>}
			/>

			{/* AI prompt bar for current table */}
			<View style={[styles.row, { marginTop: 12 }]}>
				<TextInput
					placeholder="اكتب برومبت: أضف 3 عناصر ... (لهذا الجدول)"
					placeholderTextColor="#777"
					value={aiPrompt}
					onChangeText={setAiPrompt}
					style={[styles.input, { flex: 1 }]} />
				<Pressable onPress={runAi} style={styles.primaryBtn} disabled={aiBusy}>
					{aiBusy ? <ActivityIndicator color="#111" /> : <Ionicons name="sparkles-outline" size={18} color="#111" />}
					<Text style={styles.primaryText}>ذكاء</Text>
				</Pressable>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	container: { flex: 1, backgroundColor: '#0f1115', padding: 16 },
	headerRow: { flexDirection: 'row', alignItems: 'center' },
	title: { color: '#fff', fontSize: 18, fontWeight: '800', flex: 1 },
	iconBtn: { padding: 8 },
	section: { color: '#fff', fontWeight: '800', marginTop: 12, marginBottom: 6 },
	row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
	input: { backgroundColor: '#1c1f24', color: '#fff', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10 },
	primaryBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: '#fff', borderRadius: 10 },
	primaryText: { color: '#111', fontWeight: '800' },
	chip: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#22262b', borderRadius: 14, paddingVertical: 6, paddingHorizontal: 10, marginHorizontal: 4 },
	chipText: { color: '#eee', fontWeight: '700' },
	chipIcon: { padding: 6 },
	rowCard: { backgroundColor: '#1c1f24', padding: 10, borderRadius: 12, marginTop: 10, flexDirection: 'row' },
	modalWrap: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 },
	modalCard: { backgroundColor: '#14171c', borderRadius: 12, padding: 16 },
	modalTitle: { color: '#fff', fontWeight: '800', marginBottom: 8, fontSize: 16 },
	secondaryBtn: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, backgroundColor: '#2a2f37' },
	secondaryText: { color: '#fff', fontWeight: '700' },
});


import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useNavigation } from '@react-navigation/native';

export default function MemoryTablesScreen() {
	const nav = useNavigation<any>();
	return (
		<View style={styles.container}>
			<Text style={styles.title}>جداول الذاكرة</Text>
			<Text style={styles.sub}>أنشئ جداول مخصصة لتتبع كلمات إنجليزية، ألعاب منتهية، أو أي موضوع تختاره.</Text>
			<Pressable onPress={() => nav.navigate('TablesList')} style={styles.primary}> 
				<Text style={styles.primaryText}>الانتقال إلى الجداول</Text>
			</Pressable>
		</View>
	);
}

const styles = StyleSheet.create({
	container: { flex: 1, backgroundColor: '#0f1115', padding: 16, justifyContent: 'center' },
	title: { color: '#fff', fontSize: 24, fontWeight: '800', marginBottom: 8, textAlign: 'center' },
	sub: { color: '#aaa', textAlign: 'center', marginBottom: 16 },
	primary: { alignSelf: 'center', backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12 },
	primaryText: { color: '#111', fontWeight: '800' },
});


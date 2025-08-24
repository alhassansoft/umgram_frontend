import React, { useState } from 'react';
import { ActivityIndicator, Alert, Button, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';

export default function RegisterScreen({ navigation }: any) {
  const { register } = useAuth();
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit() {
    if (!email || !username || !password) return Alert.alert('خطأ', 'الرجاء تعبئة الحقول المطلوبة');
    try {
      setSubmitting(true);
      await register({ email, username, password, displayName: displayName || null });
    } catch (e: any) {
      Alert.alert('فشل التسجيل', e?.response?.data?.error || e?.message || 'حدث خطأ');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>إنشاء حساب</Text>
      <TextInput style={styles.input} value={email} onChangeText={setEmail} placeholder="البريد الإلكتروني" keyboardType="email-address" autoCapitalize="none" />
      <TextInput style={styles.input} value={username} onChangeText={setUsername} placeholder="اسم المستخدم" autoCapitalize="none" />
      <TextInput style={styles.input} value={displayName} onChangeText={setDisplayName} placeholder="الاسم المعروض (اختياري)" />
      <TextInput style={styles.input} value={password} onChangeText={setPassword} placeholder="كلمة المرور" secureTextEntry />
      {submitting ? <ActivityIndicator /> : <Button title="تسجيل" onPress={onSubmit} />}
      <View style={{ height: 12 }} />
      <Button title="رجوع لتسجيل الدخول" onPress={() => navigation.navigate('Login')} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, justifyContent: 'center', gap: 12 },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 12, textAlign: 'center' },
  input: { borderWidth: 1, borderColor: '#ddd', padding: 12, borderRadius: 8 },
});

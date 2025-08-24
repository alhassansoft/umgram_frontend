// src/screens/LoginScreen.tsx
import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  ScrollView,
} from 'react-native';
import { useAuth } from '../auth/AuthContext';

export default function LoginScreen({ navigation }: any) {
  const { login } = useAuth();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword]   = useState('');
  const [showPass, setShowPass]   = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const passRef = useRef<TextInput>(null);

  const canSubmit = identifier.trim().length > 0 && password.length > 0 && !submitting;

  async function onSubmit() {
    if (!canSubmit) {
      Alert.alert('خطأ', 'الرجاء تعبئة جميع الحقول');
      return;
    }
    try {
      setSubmitting(true);
      await login(identifier.trim(), password);
      // النجاح سيقودك تلقائيًا للشاشات المحمية من خلال AuthContext
    } catch (e: any) {
      Alert.alert('فشل تسجيل الدخول', e?.response?.data?.error || e?.message || 'حدث خطأ');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#0f1115' }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        bounces={false}
      >
        <Text style={styles.title}>تسجيل الدخول</Text>

        {/* البريد أو اسم المستخدم */}
        <View style={styles.field}>
          <Text style={styles.label}>المعرّف</Text>
          <TextInput
            style={styles.input}
            value={identifier}
            onChangeText={setIdentifier}
            placeholder="البريد أو اسم المستخدم"
            placeholderTextColor="#9aa0a6"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="default"
            returnKeyType="next"
            onSubmitEditing={() => passRef.current?.focus()}
            textContentType="username"
            autoFocus
            editable={!submitting}
          />
        </View>

        {/* كلمة المرور */}
        <View style={styles.field}>
          <Text style={styles.label}>كلمة المرور</Text>
          <View style={styles.inputRow}>
            <TextInput
              ref={passRef}
              style={[styles.input, { flex: 1, marginBottom: 0 }]}
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              placeholderTextColor="#9aa0a6"
              secureTextEntry={!showPass}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="go"
              onSubmitEditing={onSubmit}
              textContentType="password"
              editable={!submitting}
            />
            <Pressable
              onPress={() => setShowPass((v) => !v)}
              style={({ pressed }) => [styles.showBtn, pressed && { opacity: 0.85 }]}
              disabled={submitting}
            >
              <Text style={styles.showBtnText}>{showPass ? 'إخفاء' : 'إظهار'}</Text>
            </Pressable>
          </View>
        </View>

        {/* زر الدخول */}
        <Pressable
          onPress={onSubmit}
          disabled={!canSubmit}
          style={({ pressed }) => [
            styles.submit,
            (!canSubmit || pressed) && { opacity: 0.7 },
          ]}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitText}>دخول</Text>
          )}
        </Pressable>

        {/* الانتقال للتسجيل */}
        <Pressable
          onPress={() => navigation.navigate('Register')}
          disabled={submitting}
          style={({ pressed }) => [{ marginTop: 14, opacity: pressed ? 0.7 : 1 }]}
        >
          <Text style={styles.link}>ليس لديك حساب؟ سجّل الآن</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: '100%',
    paddingHorizontal: 20,
    paddingTop: 28,
    paddingBottom: 32,
    justifyContent: 'center',
    gap: 14,
    backgroundColor: '#0f1115',
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 8,
  },
  field: {
    gap: 8,
  },
  label: {
    color: '#d2d5da',
    fontSize: 13,
    paddingHorizontal: 2,
  },
  input: {
    borderWidth: 1,
    borderColor: '#2a2f36',
    backgroundColor: '#1c1f24',
    color: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 10,
    marginBottom: 4,
  },
  inputRow: {
    flexDirection: 'row-reverse', // RTL-friendly
    alignItems: 'center',
    gap: 8,
  },
  showBtn: {
    paddingHorizontal: 12,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#2a2f36',
    backgroundColor: '#161a1f',
  },
  showBtnText: {
    color: '#d2d5da',
    fontWeight: '600',
    fontSize: 13,
  },
  submit: {
    marginTop: 8,
    backgroundColor: '#111',
    borderRadius: 12,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
  link: {
    color: '#8ab4ff',
    textAlign: 'center',
    fontWeight: '600',
  },
});

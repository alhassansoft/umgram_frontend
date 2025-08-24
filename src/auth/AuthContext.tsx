// src/auth/AuthContext.tsx
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import axios from 'axios';

// قاعدة عنوان الـ API:
// - لو عندك EXPO_PUBLIC_API_BASE_URL في البيئة يُستخدم.
// - وإلا يستخدم 10.0.2.2 لأندرويد إيموليتر، أو localhost للـ iOS/ويب.
const LOCAL_BASE =
  Platform.OS === 'android' ? 'http://10.0.2.2:5001' : 'http://localhost:5001';
const API_BASE =
  process.env.EXPO_PUBLIC_API_BASE_URL && process.env.EXPO_PUBLIC_API_BASE_URL.trim().length
    ? process.env.EXPO_PUBLIC_API_BASE_URL
    : LOCAL_BASE;

export type SafeUser = {
  id: string;
  email: string;
  username: string;
  display_name: string | null; // ملاحظة: إن كانت API تُرجع displayName، سنحوّلها لعرضها هنا
  role: string;
  status: string;
  created_at: string;
};

export type AuthContextType = {
  user: SafeUser | null;
  accessToken: string | null;
  /** alias لملاءمة شاشات تعتمد token */
  token: string | null;
  loading: boolean;
  login: (identifier: string, password: string) => Promise<void>;
  register: (input: {
    email: string;
    username: string;
    password: string;
    displayName?: string | null;
  }) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// عميل Axios واحد يُعاد استخدامه
const client = axios.create({ baseURL: API_BASE });

// محوِّل بسيط لتطبيع شكل المستخدم القادم من الـ API
function normalizeUser(u: any): SafeUser {
  if (!u) throw new Error('Invalid user payload');
  return {
    id: String(u.id),
    email: String(u.email ?? u.user_email ?? ''),
    username: String(u.username ?? u.handle ?? ''),
    display_name:
      (u.display_name ?? u.displayName ?? u.name ?? null) as string | null,
    role: String(u.role ?? 'user'),
    status: String(u.status ?? 'active'),
    created_at: String(u.created_at ?? u.createdAt ?? new Date().toISOString()),
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SafeUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // حمّل الجلسة من SecureStore عند الإقلاع
  useEffect(() => {
    (async () => {
      try {
        const [t, u] = await Promise.all([
          SecureStore.getItemAsync('accessToken'),
          SecureStore.getItemAsync('user'),
        ]);
        if (t) {
          setAccessToken(t);
          client.defaults.headers.common.Authorization = `Bearer ${t}`;
        }
        if (u) setUser(JSON.parse(u));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // حدّث هيدر Authorization في العميل عند تغيّر التوكن
  useEffect(() => {
    if (accessToken) {
      client.defaults.headers.common.Authorization = `Bearer ${accessToken}`;
    } else {
      delete client.defaults.headers.common.Authorization;
    }
  }, [accessToken]);

  async function login(identifier: string, password: string) {
    // ملاحظة: استخدم axios المباشر بعنوان كامل لتفادي أي هيدر سابق
    const r1 = await axios.post(`${API_BASE}/api/auth/login`, {
      identifier,
      password,
    });

    // نتوقع أحد الشكلين:
    // { user, accessToken } أو { token } وربما لا يوجد user
    const at: string =
      r1.data?.accessToken ?? r1.data?.token ?? r1.data?.access_token;
    if (!at) throw new Error('لم يتم استلام accessToken من الخادم');

    // إن وُجد user مباشرة
    let u: SafeUser | null = null;
    if (r1.data?.user) {
      u = normalizeUser(r1.data.user);
    } else {
      // وإلا اجلبه من /api/me
      const r2 = await axios.get(`${API_BASE}/api/me`, {
        headers: { Authorization: `Bearer ${at}` },
      });
      // قد يُرجع { user: {...} } أو مباشرة {...}
      const raw = r2.data?.user ?? r2.data;
      u = normalizeUser(raw);
    }

    setAccessToken(at);
    setUser(u);

    // خزّن الجلسة
    await SecureStore.setItemAsync('accessToken', at);
    await SecureStore.setItemAsync('user', JSON.stringify(u));
  }

  async function register(input: {
    email: string;
    username: string;
    password: string;
    displayName?: string | null;
  }) {
    // بعض APIs تتوقع displayName، وأخرى display_name — أرسل كما هو واسم إضافي
    const payload = {
      ...input,
      display_name:
        input.displayName !== undefined ? input.displayName : undefined,
    };

    const r1 = await axios.post(`${API_BASE}/api/auth/register`, payload);

    const at: string =
      r1.data?.accessToken ?? r1.data?.token ?? r1.data?.access_token;
    if (!at) throw new Error('لم يتم استلام accessToken من الخادم');

    let u: SafeUser | null = null;
    if (r1.data?.user) {
      u = normalizeUser(r1.data.user);
    } else {
      const r2 = await axios.get(`${API_BASE}/api/me`, {
        headers: { Authorization: `Bearer ${at}` },
      });
      const raw = r2.data?.user ?? r2.data;
      u = normalizeUser(raw);
    }

    setAccessToken(at);
    setUser(u);

    await SecureStore.setItemAsync('accessToken', at);
    await SecureStore.setItemAsync('user', JSON.stringify(u));
  }

  async function logout() {
    setUser(null);
    setAccessToken(null);
    await SecureStore.deleteItemAsync('accessToken');
    await SecureStore.deleteItemAsync('user');
  }

  const value: AuthContextType = useMemo(
    () => ({
      user,
      accessToken,
      token: accessToken, // alias للتوافق مع شاشات تستخدم token
      loading,
      login,
      register,
      logout,
    }),
    [user, accessToken, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

// (اختياري) يمكن استيراده لاستخدام نفس العميل في بقية الصفحات
export const api = client;

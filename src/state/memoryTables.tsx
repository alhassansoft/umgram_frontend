import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import { useAuth } from '../auth/AuthContext';

export type MemoryColumn = { id: string; name: string };
export type MemoryRow = { id: string; values: Record<string, string> };
export type MemoryTable = {
  id: string;
  name: string;
  columns: MemoryColumn[];
  rows?: MemoryRow[]; // fetched lazily via loadTable
  rowsCount?: number; // from list endpoint
  createdAt?: number;
  updatedAt?: number;
};

type Ctx = {
  tables: MemoryTable[];
  loading: boolean;
  refresh: () => Promise<void>;
  loadTable: (tableId: string) => Promise<MemoryTable | null>;
  addTable: (name: string, columns: string[]) => Promise<string>; // returns tableId
  renameTable: (tableId: string, name: string) => Promise<void>;
  deleteTable: (tableId: string) => Promise<void>;
  addColumn: (tableId: string, colName: string) => Promise<string>; // returns columnId
  renameColumn: (tableId: string, colId: string, newName: string) => Promise<void>;
  deleteColumn: (tableId: string, colId: string) => Promise<void>;
  addRow: (tableId: string, values: Record<string, string>) => Promise<string>; // returns rowId
  updateRow: (tableId: string, rowId: string, values: Record<string, string>) => Promise<void>;
  deleteRow: (tableId: string, rowId: string) => Promise<void>;
};

const LOCAL_BASE = Platform.OS === 'android' ? 'http://10.0.2.2:5001' : 'http://localhost:5001';
const API_BASE = (process.env.EXPO_PUBLIC_API_BASE_URL && process.env.EXPO_PUBLIC_API_BASE_URL.trim())
  ? process.env.EXPO_PUBLIC_API_BASE_URL
  : (process.env.EXPO_PUBLIC_API_BASE && process.env.EXPO_PUBLIC_API_BASE.trim())
    ? process.env.EXPO_PUBLIC_API_BASE
    : LOCAL_BASE;

const MemoryTablesContext = createContext<Ctx | undefined>(undefined);

export function MemoryTablesProvider({ children }: { children: React.ReactNode }) {
  const [tables, setTables] = useState<MemoryTable[]>([]);
  const [loading, setLoading] = useState(true);
  const { accessToken } = useAuth();
  // Build typed headers to satisfy fetch's HeadersInit without unions
  const headers = (withJson: boolean = true): Record<string, string> => {
    const h: Record<string, string> = {};
    if (withJson) h['Content-Type'] = 'application/json';
    if (accessToken) h['Authorization'] = `Bearer ${accessToken}`;
    return h;
  };

  useEffect(() => {
    (async () => {
      if (accessToken) {
        await refresh();
      } else {
        // No token yet; don't hit the API unauthenticated
        setLoading(false);
      }
    })();
  }, [accessToken]);

  const refresh = async () => {
    setLoading(true);
    try {
  const res = await fetch(`${API_BASE}/api/memory/tables`, { headers: headers(true) });
      if (!res.ok) throw new Error(`list failed ${res.status}`);
      const data = await res.json();
      // Expecting an array with columns and rowsCount
      const mapped: MemoryTable[] = (data || []).map((t: any) => ({
        id: t.id,
        name: t.name,
        columns: (t.columns || []).map((c: any) => ({ id: c.id, name: c.name })),
        rowsCount: t.rowsCount ?? 0,
        createdAt: t.createdAt ? new Date(t.createdAt).getTime() : undefined,
        updatedAt: t.updatedAt ? new Date(t.updatedAt).getTime() : undefined,
      }));
      setTables(mapped);
    } catch (e) {
      setTables([]);
    } finally {
      setLoading(false);
    }
  };

  const mergeTable = (t: MemoryTable) => setTables((prev) => {
    const i = prev.findIndex((x) => x.id === t.id);
    if (i === -1) return [t, ...prev];
    const next = prev.slice();
    next[i] = { ...prev[i], ...t };
    return next;
  });

  const loadTable: Ctx['loadTable'] = async (tableId) => {
  if (!accessToken) return null;
    try {
  const res = await fetch(`${API_BASE}/api/memory/tables/${tableId}`, { headers: headers(true) });
      if (!res.ok) throw new Error(`get table failed ${res.status}`);
      const t = await res.json();
      const table: MemoryTable = {
        id: t.id,
        name: t.name,
        columns: (t.columns || []).map((c: any) => ({ id: c.id, name: c.name })),
        rows: (t.rows || []).map((r: any) => ({ id: r.id, values: r.values || {} })),
        rowsCount: (t.rows || []).length,
        createdAt: t.createdAt ? new Date(t.createdAt).getTime() : undefined,
        updatedAt: t.updatedAt ? new Date(t.updatedAt).getTime() : undefined,
      };
      mergeTable(table);
      return table;
    } catch {
      return null;
    }
  };

  const addTable: Ctx['addTable'] = async (name, columnNames) => {
    const res = await fetch(`${API_BASE}/api/memory/tables`, {
      method: 'POST',
  headers: headers(true),
      body: JSON.stringify({ name, columns: columnNames }),
    });
    if (!res.ok) throw new Error(`create failed ${res.status}`);
    const t = await res.json();
    const table: MemoryTable = {
      id: t.id, name: t.name,
      columns: (t.columns || []).map((c: any) => ({ id: c.id, name: c.name })),
      rows: [], rowsCount: 0,
    };
    mergeTable(table);
    return table.id;
  };

  const renameTable: Ctx['renameTable'] = async (tableId, name) => {
    const res = await fetch(`${API_BASE}/api/memory/tables/${tableId}`, {
      method: 'PATCH', headers: headers(true), body: JSON.stringify({ name }),
    });
    if (!res.ok) throw new Error('rename failed');
    setTables((prev) => prev.map((t) => (t.id === tableId ? { ...t, name } : t)));
  };

  const deleteTable: Ctx['deleteTable'] = async (tableId) => {
    const res = await fetch(`${API_BASE}/api/memory/tables/${tableId}`, { method: 'DELETE', headers: headers(false) });
    if (!res.ok) throw new Error('delete failed');
    setTables((prev) => prev.filter((t) => t.id !== tableId));
  };

  const addColumn: Ctx['addColumn'] = async (tableId, colName) => {
    const res = await fetch(`${API_BASE}/api/memory/tables/${tableId}/columns`, {
      method: 'POST', headers: headers(true), body: JSON.stringify({ name: colName }),
    });
    if (!res.ok) throw new Error('add column failed');
    const c = await res.json();
    setTables((prev) => prev.map((t) => (t.id === tableId ? { ...t, columns: [...t.columns, { id: c.id, name: c.name }] } : t)));
    return c.id as string;
  };

  const renameColumn: Ctx['renameColumn'] = async (tableId, colId, newName) => {
    const res = await fetch(`${API_BASE}/api/memory/tables/${tableId}/columns/${colId}`, {
      method: 'PATCH', headers: headers(true), body: JSON.stringify({ name: newName }),
    });
    if (!res.ok) throw new Error('rename column failed');
    setTables((prev) => prev.map((t) => (t.id === tableId ? { ...t, columns: t.columns.map((c) => (c.id === colId ? { ...c, name: newName } : c)) } : t)));
  };

  const deleteColumn: Ctx['deleteColumn'] = async (tableId, colId) => {
    const res = await fetch(`${API_BASE}/api/memory/tables/${tableId}/columns/${colId}`, { method: 'DELETE', headers: headers(false) });
    if (!res.ok) throw new Error('delete column failed');
    setTables((prev) => prev.map((t) => (t.id === tableId ? { ...t, columns: t.columns.filter((c) => c.id !== colId) } : t)));
  };

  const addRow: Ctx['addRow'] = async (tableId, values) => {
    const res = await fetch(`${API_BASE}/api/memory/tables/${tableId}/rows`, {
      method: 'POST', headers: headers(true), body: JSON.stringify({ values }),
    });
    if (!res.ok) throw new Error('add row failed');
    const r = await res.json();
    setTables((prev) => prev.map((t) => (t.id === tableId ? { ...t, rows: [{ id: r.id, values: r.values || {} }, ...(t.rows || [])], rowsCount: (t.rowsCount ?? 0) + 1 } : t)));
    return r.id as string;
  };

  const updateRow: Ctx['updateRow'] = async (tableId, rowId, values) => {
    const res = await fetch(`${API_BASE}/api/memory/tables/${tableId}/rows/${rowId}`, {
      method: 'PATCH', headers: headers(true), body: JSON.stringify({ values }),
    });
    if (!res.ok) throw new Error('update row failed');
    setTables((prev) => prev.map((t) => (t.id === tableId ? { ...t, rows: (t.rows || []).map((r) => (r.id === rowId ? { ...r, values } : r)) } : t)));
  };

  const deleteRow: Ctx['deleteRow'] = async (tableId, rowId) => {
    const res = await fetch(`${API_BASE}/api/memory/tables/${tableId}/rows/${rowId}`, { method: 'DELETE', headers: headers(false) });
    if (!res.ok) throw new Error('delete row failed');
    setTables((prev) => prev.map((t) => (t.id === tableId ? { ...t, rows: (t.rows || []).filter((r) => r.id !== rowId), rowsCount: Math.max(0, (t.rowsCount ?? 0) - 1) } : t)));
  };

  const value = useMemo<Ctx>(
    () => ({ tables, loading, refresh, loadTable, addTable, renameTable, deleteTable, addColumn, renameColumn, deleteColumn, addRow, updateRow, deleteRow }),
    [tables, loading, accessToken],
  );

  return <MemoryTablesContext.Provider value={value}>{children}</MemoryTablesContext.Provider>;
}

export function useMemoryTables(): Ctx {
  const ctx = useContext(MemoryTablesContext);
  if (!ctx) throw new Error('useMemoryTables must be used within MemoryTablesProvider');
  return ctx;
}

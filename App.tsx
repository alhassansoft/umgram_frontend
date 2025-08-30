// App.tsx
import React, { useLayoutEffect, useMemo, useRef } from 'react';
import {
  View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator, SafeAreaView, Platform, Animated
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Provider as PaperProvider, MD3DarkTheme, MD3LightTheme } from 'react-native-paper';
import {
  NavigationContainer,
  getFocusedRouteNameFromRoute,
  type RouteProp
} from '@react-navigation/native';
import { createNativeStackNavigator, NativeStackScreenProps } from '@react-navigation/native-stack';
import { createBottomTabNavigator, BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { TextInput } from 'react-native';
import { api } from './src/auth/AuthContext';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFonts } from 'expo-font';

import { AuthProvider, useAuth } from './src/auth/AuthContext';
import LoginScreen from './src/screens/LoginScreen';
import RegisterScreen from './src/screens/RegisterScreen';
import DiarysScreen from './src/screens/DiarysScreen';
import NotesScreen from './src/screens/NotesScreen';
import ChatScreen from './src/screens/ChatScreen';
import ConversationsScreen from './src/screens/ConversationsScreen';
import UsersListScreen from './src/screens/UsersListScreen';
import DirectConversationScreen from './src/screens/DirectConversationScreen';
import ChatSearchScreen from './src/screens/ChatSearchScreen';
import MicroblogScreen from './src/screens/MicroblogScreen';
import ConfessionScreen from './src/screens/ConfessionScreen';
import MemoryTablesScreen from './src/screens/MemoryTablesScreen';
import AlbumScreen from './src/screens/AlbumScreen';
import AlbumDetailScreen from './src/screens/AlbumDetailScreen';
import TablesListScreen from './src/screens/TablesListScreen';
import TableDetailScreen from './src/screens/TableDetailScreen';
import { MemoryTablesProvider } from './src/state/memoryTables';
import ExploreScreen from './src/screens/ExploreScreen';

/* Web a11y helper: avoid hiding focused elements by blurring before route changes */
function blurActiveElement() {
  if (typeof document !== 'undefined') {
    const el = document.activeElement as HTMLElement | null;
    if (el && typeof el.blur === 'function') el.blur();
  }
}

/* Root stack */
type RootStackParamList = {
  Login: undefined;
  Register: undefined;
  Main: undefined;
  Create: undefined;
};

/* Tabs */
type TabsParamList = {
  SocialTab: undefined;
  PersonalTab: undefined;
  CreateTrigger: undefined;
  ExploreTab: undefined;
  ShopTab: undefined;
};

/* Per-tab stacks */
type SocialStackParamList = {
  SocialHub: undefined;
  Chat: undefined; // will map to Conversations list
  ChatSearch: undefined;
  Users: undefined;
  DirectConversation: { id: string } | undefined;
  MicroblogX: undefined;
  VideoFeed: undefined;
  Confession: undefined; // فضفضة
  // Quick category pages
  Games: undefined;
  Challenge: undefined;
  Tasks: undefined;
  HeardAbout: undefined;
  Detective: undefined;
  QnA: undefined;
  Ideas: undefined;
  Polls: undefined;
  Events: undefined;
};
type PersonalStackParamList = {
  PersonalHub: undefined;
  Diary: undefined;
  Notes: undefined;
  MemoryTables: undefined;
  TablesList: undefined;
  TableDetail: { id: string } | undefined;
  Album: undefined;
  AlbumDetail: { id: string; title: string } | undefined;
  Link: undefined; // ربط
};
type ExploreStackParamList = {
  ExploreHub: undefined;
  Map: undefined;
};
type ShopStackParamList = {
  ShopHub: undefined;
  Shopping: undefined;
};

const RootStack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabsParamList>();

const SocialStack = createNativeStackNavigator<SocialStackParamList>();
const PersonalStack = createNativeStackNavigator<PersonalStackParamList>();
const ExploreStack = createNativeStackNavigator<ExploreStackParamList>();
const ShopStack = createNativeStackNavigator<ShopStackParamList>();

/* UI constants */
const BAR_HEIGHT = 64;
const CHIPS_HEIGHT = 50;
const GAP_BELOW_CHIPS = 8;

/* Small UI bits */
function GridButton({ label, subtitle, onPress }: { label: string; subtitle?: string; onPress: () => void }) {
  return (
    <Pressable style={({ pressed }) => [styles.card, pressed && styles.cardPressed]} onPress={onPress}>
      <Text style={styles.cardLabel}>{label}</Text>
      {!!subtitle && <Text style={styles.cardSub}>{subtitle}</Text>}
    </Pressable>
  );
}
function Placeholder({ title }: { title: string }) {
  return (
    <View style={styles.placeholder}>
      <Text style={styles.placeholderTitle}>{title}</Text>
      <Text style={styles.placeholderSub}>هذه شاشة تجريبية — اربطها لاحقًا.</Text>
    </View>
  );
}

/* Dummy feature screens */
const ChatScreenComponent  = ChatScreen;
// Real Microblog screen
const MicroblogXScreen  = MicroblogScreen;
const VideoFeedScreen   = () => <Placeholder title="TikTok-like (Video Feed)" />;
// Real Confession screen (assistant chat)
const Confess = ConfessionScreen;
// Use the real DiarysScreen for Diary page
const DiaryScreen = DiarysScreen;
// Use the real Notes screen
const Notes = NotesScreen;
const LinkScreen        = () => <Placeholder title="ربط" />;
const MapScreen         = ExploreScreen;
const ShoppingScreen    = () => <Placeholder title="Shopping" />;
// Quick category pages (simple placeholders for now)
const GamesScreen      = () => <Placeholder title="Games" />;
const ChallengeScreen  = () => <Placeholder title="Challenge" />;
const TasksScreen      = () => <Placeholder title="Tasks" />;
const HeardAboutScreen = () => <Placeholder title="I heard about" />;
const DetectiveScreen  = () => <Placeholder title="Detective" />;
const QnAScreen        = () => <Placeholder title="Q&A" />;
const IdeasScreen      = () => <Placeholder title="Ideas" />;
const PollsScreen      = () => <Placeholder title="Polls" />;
const EventsScreen     = () => <Placeholder title="Events" />;

/* Logout header button */
function LogoutButton() {
  const { logout } = useAuth();
  return (
    <Pressable onPress={logout} style={({ pressed }) => [{ paddingHorizontal: 8, opacity: pressed ? 0.6 : 1 }]}>
      <Text style={{ color: '#d00', fontWeight: '700' }}>Logout</Text>
    </Pressable>
  );
}

/* Chips */
type ChipItem = { key: string; label: string; route: string; icon?: keyof typeof Ionicons.glyphMap };

function ChipButton({ label, icon, active, onPress }: { label: string; icon?: string; active: boolean; onPress: () => void; }) {
  const scale = useRef(new Animated.Value(1)).current;
  const useNative = Platform.OS === 'ios' || Platform.OS === 'android';
  const pressIn  = () => Animated.spring(scale, { toValue: 0.96, useNativeDriver: useNative, speed: 20, bounciness: 6 }).start();
  const pressOut = () => Animated.spring(scale, { toValue: 1,    useNativeDriver: useNative, speed: 20, bounciness: 6 }).start();
  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        onPressIn={pressIn}
        onPressOut={pressOut}
        onPress={() => { if (Platform.OS === 'web') blurActiveElement(); onPress(); }}
        style={[styles.chip, active && styles.chipActive]}
      >
        {icon ? <Ionicons name={icon as any} size={16} color={active ? '#fff' : '#111'} style={{ marginRight: 6 }} /> : null}
        <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
      </Pressable>
    </Animated.View>
  );
}

function ChipsForStack({
  items, activeRoute, navigate,
}: { items: ChipItem[]; activeRoute?: string; navigate: (route: string) => void; }) {
  const inset = useSafeAreaInsets();
  const containerBottom = (inset.bottom || 10) + BAR_HEIGHT + GAP_BELOW_CHIPS;
  const activeKey = useMemo(() => (items.some((it) => it.route === activeRoute) ? activeRoute : items[0]?.route), [activeRoute, items]);

  return (
    <View
      style={[
        styles.chipsWrap,
        { bottom: containerBottom },
        Platform.OS === 'web' ? ({ pointerEvents: 'box-none' } as any) : null,
      ]}
      {...(Platform.OS !== 'web' ? { pointerEvents: 'box-none' as const } : {})}
    >
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
        {items.map((it) => (
          <ChipButton key={it.key} label={it.label} icon={it.icon} active={it.route === activeKey} onPress={() => navigate(it.route)} />
        ))}
      </ScrollView>
    </View>
  );
}

/* Hubs */
function SocialHubScreen({ navigation }: any) {
  return (
    <ScrollView contentContainerStyle={[styles.hub, { paddingBottom: BAR_HEIGHT + CHIPS_HEIGHT + 48 }]}> 
      <Text style={styles.hubTitle}>Social</Text>
      <GridButton label="Chat" subtitle="الدردشات" onPress={() => navigation.navigate('Chat')} />
      <GridButton label="Users" subtitle="دردشة مباشرة" onPress={() => navigation.navigate('Users')} />
  <GridButton label="Microblog" subtitle="منشورات" onPress={() => navigation.navigate('MicroblogX')} />
      <GridButton label="TikTok-like (Video)" onPress={() => navigation.navigate('VideoFeed')} />
  <GridButton label="Vent" onPress={() => navigation.navigate('Confession')} />
    </ScrollView>
  );
}
function PersonalHubScreen({ navigation }: any) {
  return (
    <ScrollView contentContainerStyle={[styles.hub, { paddingBottom: BAR_HEIGHT + CHIPS_HEIGHT + 48 }]}>
      <Text style={styles.hubTitle}>Personal</Text>
      <GridButton label="Diary" onPress={() => navigation.navigate('Diary')} />
      <GridButton label="Notes" onPress={() => navigation.navigate('Notes')} />
  <GridButton label="Memory Tables" subtitle="جداول الذاكرة" onPress={() => navigation.navigate('MemoryTables')} />
      <GridButton label="Album" onPress={() => navigation.navigate('Album')} />
      <GridButton label="Link" onPress={() => navigation.navigate('Link')} />
    </ScrollView>
  );
}
function ExploreHubScreen({ navigation }: any) {
  return (
    <ScrollView contentContainerStyle={[styles.hub, { paddingBottom: BAR_HEIGHT + CHIPS_HEIGHT + 48 }]}>
      <Text style={styles.hubTitle}>Explore</Text>
      <GridButton label="Map" onPress={() => navigation.navigate('Map')} />
    </ScrollView>
  );
}
function ShopHubScreen({ navigation }: any) {
  return (
    <ScrollView contentContainerStyle={[styles.hub, { paddingBottom: BAR_HEIGHT + CHIPS_HEIGHT + 48 }]}>
      <Text style={styles.hubTitle}>Shop</Text>
      <GridButton label="Shopping" onPress={() => navigation.navigate('Shopping')} />
    </ScrollView>
  );
}

/* Stacks + chips per tab */
function SocialStackShellWrapper({ navigation, route }: { navigation: any; route: RouteProp<TabsParamList, 'SocialTab'> }) {
  const chips: ChipItem[] = [
    { key: 'chat',      label: 'دردشة',     route: 'Chat',       icon: 'chatbubbles-outline' },
  { key: 'chatsearch',label: 'بحث دردشة', route: 'ChatSearch', icon: 'search-outline' },
    { key: 'users',     label: 'مستخدمون',  route: 'Users',      icon: 'people-outline' },
    { key: 'microblog', label: 'منشورات',   route: 'MicroblogX', icon: 'megaphone-outline' },
    { key: 'video',     label: 'فيديو قصير', route: 'VideoFeed',  icon: 'videocam-outline' },
    { key: 'confess',   label: 'فضفضة',      route: 'Confession', icon: 'chatbubble-ellipses-outline' },
  ];
  const activeChild = getFocusedRouteNameFromRoute(route) as string | undefined;

  return (
    <View style={{ flex: 1 }}>
      <SocialStack.Navigator screenOptions={{ headerShown: false }}>
        <SocialStack.Screen name="SocialHub" component={SocialHubScreen} />
        <SocialStack.Screen name="Chat" component={ConversationsScreen} />
  <SocialStack.Screen name="ChatSearch" component={ChatSearchScreen} />
        <SocialStack.Screen name="Users" component={UsersListScreen} />
        <SocialStack.Screen name="DirectConversation" component={DirectConversationScreen} />
        <SocialStack.Screen name="MicroblogX" component={MicroblogXScreen} />
        <SocialStack.Screen name="VideoFeed" component={VideoFeedScreen} />
  <SocialStack.Screen name="Confession" component={Confess} />
  {/* Quick category pages */}
  <SocialStack.Screen name="Games" component={GamesScreen} />
  <SocialStack.Screen name="Challenge" component={ChallengeScreen} />
  <SocialStack.Screen name="Tasks" component={TasksScreen} />
  <SocialStack.Screen name="HeardAbout" component={HeardAboutScreen} />
  <SocialStack.Screen name="Detective" component={DetectiveScreen} />
  <SocialStack.Screen name="QnA" component={QnAScreen} />
  <SocialStack.Screen name="Ideas" component={IdeasScreen} />
  <SocialStack.Screen name="Polls" component={PollsScreen} />
  <SocialStack.Screen name="Events" component={EventsScreen} />
      </SocialStack.Navigator>
      <ChipsForStack
        items={chips}
        activeRoute={activeChild}
        navigate={(routeName) => navigation.navigate('SocialTab', { screen: routeName })}
      />
    </View>
  );
}

function PersonalStackShellWrapper({ navigation, route }: { navigation: any; route: RouteProp<TabsParamList, 'PersonalTab'> }) {
  const chips: ChipItem[] = [
    { key: 'diary', label: 'مذكرات', route: 'Diary',  icon: 'book-outline' },
    { key: 'notes', label: 'ملاحظات', route: 'Notes',  icon: 'pencil-outline' },
  { key: 'memory', label: 'جداول الذاكرة', route: 'MemoryTables',  icon: 'grid-outline' },
    { key: 'album', label: 'ألبوم',   route: 'Album',  icon: 'images-outline' },
    { key: 'link',  label: 'ربط',     route: 'Link',   icon: 'link-outline' },
  ];
  const activeChild = getFocusedRouteNameFromRoute(route) as string | undefined;

  return (
    <View style={{ flex: 1 }}>
      <PersonalStack.Navigator screenOptions={{ headerShown: false }}>
        <PersonalStack.Screen name="PersonalHub" component={PersonalHubScreen} />
        <PersonalStack.Screen name="Diary" component={DiaryScreen} />
    <PersonalStack.Screen name="Notes" component={Notes} />
    <PersonalStack.Screen name="MemoryTables" component={MemoryTablesScreen} />
    <PersonalStack.Screen name="TablesList" component={TablesListScreen} />
    <PersonalStack.Screen name="TableDetail" component={TableDetailScreen} />
  <PersonalStack.Screen name="Album" component={AlbumScreen} />
  <PersonalStack.Screen name="AlbumDetail" component={AlbumDetailScreen} />
        <PersonalStack.Screen name="Link" component={LinkScreen} />
      </PersonalStack.Navigator>
      <ChipsForStack
        items={chips}
        activeRoute={activeChild}
        navigate={(routeName) => navigation.navigate('PersonalTab', { screen: routeName })}
      />
    </View>
  );
}

function ExploreStackShellWrapper({ navigation, route }: { navigation: any; route: RouteProp<TabsParamList, 'ExploreTab'> }) {
  const chips: ChipItem[] = [{ key: 'map', label: 'الخريطة', route: 'Map', icon: 'map-outline' }];
  const activeChild = getFocusedRouteNameFromRoute(route) as string | undefined;

  return (
    <View style={{ flex: 1 }}>
      <ExploreStack.Navigator screenOptions={{ headerShown: false }}>
        <ExploreStack.Screen name="ExploreHub" component={ExploreHubScreen} />
        <ExploreStack.Screen name="Map" component={MapScreen} />
      </ExploreStack.Navigator>
      <ChipsForStack
        items={chips}
        activeRoute={activeChild}
        navigate={(routeName) => navigation.navigate('ExploreTab', { screen: routeName })}
      />
    </View>
  );
}

function ShopStackShellWrapper({ navigation, route }: { navigation: any; route: RouteProp<TabsParamList, 'ShopTab'> }) {
  const chips: ChipItem[] = [{ key: 'shop', label: 'تسوّق', route: 'Shopping', icon: 'bag-handle-outline' }];
  const activeChild = getFocusedRouteNameFromRoute(route) as string | undefined;

  return (
    <View style={{ flex: 1 }}>
      <ShopStack.Navigator screenOptions={{ headerShown: false }}>
        <ShopStack.Screen name="ShopHub" component={ShopHubScreen} />
        <ShopStack.Screen name="Shopping" component={ShoppingScreen} />
      </ShopStack.Navigator>
      <ChipsForStack
        items={chips}
        activeRoute={activeChild}
        navigate={(routeName) => navigation.navigate('ShopTab', { screen: routeName })}
      />
    </View>
  );
}

/* Custom Tab Bar (+ inside bar) */
function CustomTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const inset = useSafeAreaInsets();
  const focusedIndex = state.index;
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [searchQ, setSearchQ] = React.useState('');
  const [searching, setSearching] = React.useState(false);
  const [searchError, setSearchError] = React.useState<string | null>(null);
  const [results, setResults] = React.useState<Array<any>>([]);
  const [mode, setMode] = React.useState<'wide' | 'strict'>('wide');
  const [selectorAnswer, setSelectorAnswer] = React.useState<any | null>(null);
  const [rawHits, setRawHits] = React.useState<any[] | null>(null);
  const QUICK_CATEGORIES = React.useMemo(() => (
    [
      { key: 'games',      label: 'Games',         icon: 'game-controller-outline' },
      { key: 'challenge',  label: 'Challenge',     icon: 'trophy-outline' },
      { key: 'tasks',      label: 'Tasks',         icon: 'checkmark-done-outline' },
      { key: 'heard',      label: 'I heard about', icon: 'megaphone-outline' },
      { key: 'detective',  label: 'Detective',     icon: 'search-outline' },
      { key: 'qna',        label: 'Q&A',           icon: 'help-circle-outline' },
      { key: 'ideas',      label: 'Ideas',         icon: 'bulb-outline' },
      { key: 'polls',      label: 'Polls',         icon: 'people-outline' },
      { key: 'events',     label: 'Events',        icon: 'calendar-outline' },
    ]
  ), []);
  // Search scope (where to search)
  // Empty selection means "All"
  const [selectedTypes, setSelectedTypes] = React.useState<string[]>([]);

  const TYPE_OPTIONS = React.useMemo(() => (
    [
      { key: 'all',       label: 'الكل' },
      { key: 'diary',     label: 'مذكرات' },
      { key: 'note',      label: 'ملاحظات' },
      { key: 'memory',    label: 'جداول الذاكرة' },
      { key: 'microblog', label: 'منشورات' },
      // { key: 'chat',   label: 'دردشات' }, // Uncomment when backend supports it
    ]
  ), []);

  const toggleType = React.useCallback((key: string) => {
    if (key === 'all') {
      setSelectedTypes([]); // All
      return;
    }
    setSelectedTypes((prev) => {
      const has = prev.includes(key);
      const next = has ? prev.filter((k) => k !== key) : [...prev, key];
      return next;
    });
  }, []);

  const doSearch = React.useCallback(async (qOverride?: string) => {
    const term = (qOverride ?? searchQ).trim();
    if (!term) return;
    setSearching(true);
    setSearchError(null);
    setResults([]);
    setSelectorAnswer(null);
    try {
      const params: Record<string, any> = { q: term, mode };
      if (selectedTypes.length > 0) {
        // Send as comma-separated list. Backend can ignore if unsupported.
        params.types = selectedTypes.join(',');
      }
      const r = await api.get('/api/search', { params });
      // Support both shapes: {hits:[...]} or direct array
      const hits = Array.isArray(r.data?.hits) ? r.data.hits : null;
      if (hits) {
        setRawHits(hits);
        // Normalize for simple list rendering
        const normalized = hits.map((h: any) => {
          const src = h._source || {};
          const title = src.title || src.name || '';
          const content = src.content || src.text || '';
          const snippet = (h.highlight?.content?.[0]) || (typeof content === 'string' ? String(content).slice(0, 160) : '');
          const created_at = src.createdAt || src.updatedAt || src.created_at || src.updated_at || null;
          const type = src.type || src.kind || src.source || null;
          return { id: h._id, score: h._score, title, snippet, created_at, type };
        });
        setResults(normalized);
        // Call server answer selector with top hits
        try {
          const sel = await api.post('/api/search/answer', {
            question: term,
            mode,
            hits: hits.slice(0, 10),
          });
          setSelectorAnswer(sel.data);
        } catch (e) {
          // ignore selector failures; still show hits
        }
      } else {
        const arr = Array.isArray(r.data) ? r.data : (Array.isArray(r.data?.results) ? r.data.results : []);
        setResults(arr);
        setRawHits(null);
      }
    } catch (e:any) {
      setSearchError('فشل البحث، حاول مجددًا.');
    } finally {
      setSearching(false);
    }
  }, [searchQ, selectedTypes, mode]);

  // Do not auto-search on filter changes; only search when user presses the search button or submits input.

  const iconFor = (name: string, focused: boolean) => {
    const color = focused ? '#fff' : '#c7c7c7';
    switch (name) {
  case 'SocialTab':   return <Ionicons name="chatbubbles-outline" size={22} color={color} />;
  case 'PersonalTab': return <Ionicons name="person-circle-outline" size={24} color={color} />;
  case 'ExploreTab':  return <Ionicons name="map-outline" size={22} color={color} />;
  case 'ShopTab':     return <Ionicons name="bag-handle-outline" size={22} color={color} />;
      default:            return <Ionicons name="ellipse-outline" size={22} color={color} />;
    }
  };

  const routes = state.routes;

  return (
    <View style={[styles.tabWrap, { paddingBottom: inset.bottom }]}>
      <View style={[styles.tabBar, { height: BAR_HEIGHT }]}>
        {routes.slice(0, 2).map((route, idx) => {
          const isFocused = focusedIndex === idx;
          const onPress = () => { if (Platform.OS === 'web') blurActiveElement(); navigation.navigate(route.name as never); };
          return (
            <Pressable key={route.key} onPress={onPress} style={styles.tabItem} accessibilityRole="button">
              {iconFor(route.name, isFocused)}
              <Text style={[styles.tabLabel, isFocused && styles.tabLabelActive]}>
                {descriptors[route.key].options.title ?? route.name.replace('Tab','')}
              </Text>
            </Pressable>
          );
        })}

        <Pressable
          key="center-plus"
          onPress={() => { if (Platform.OS === 'web') blurActiveElement(); setSearchOpen(true); }}
          style={({ pressed }) => [styles.plusItem, pressed && { opacity: 0.85 }]}
          accessibilityLabel="Create"
          accessibilityRole="button"
        >
          <Ionicons name="add" size={24} color="#111" />
        </Pressable>

        {routes.slice(3, 5).map((route, i) => {
          const idxGlobal = i + 3;
          const isFocused = focusedIndex === idxGlobal;
          const onPress = () => { if (Platform.OS === 'web') blurActiveElement(); navigation.navigate(route.name as never); };
          return (
            <Pressable key={route.key} onPress={onPress} style={styles.tabItem} accessibilityRole="button">
              {iconFor(route.name, isFocused)}
              <Text style={[styles.tabLabel, isFocused && styles.tabLabelActive]}>
                {descriptors[route.key].options.title ?? route.name.replace('Tab','')}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {/* Global Prompt Search Overlay */}
      {searchOpen && (
        <View style={styles.searchOverlay} pointerEvents="auto">
          <Pressable style={StyleSheet.absoluteFill as any} onPress={() => setSearchOpen(false)} accessibilityLabel="Close search" />
          <View
            style={[styles.searchCard, { paddingBottom: inset.bottom + 12 }]}
            // Ensure touches on the card are captured and not passed through to underlying views
            onStartShouldSetResponder={() => true}
          >
            {/* Quick category grid (3x3) */}
            <View style={styles.quickBox}>
              <View style={styles.quickGrid}>
                {QUICK_CATEGORIES.map((c) => (
                  <Pressable
                    key={c.key}
                    style={styles.quickTile}
                    onPress={() => {
                      // Navigate to dedicated pages instead of searching
                      const routeMap: Record<string, string> = {
                        games: 'Games',
                        challenge: 'Challenge',
                        tasks: 'Tasks',
                        heard: 'HeardAbout',
                        detective: 'Detective',
                        qna: 'QnA',
                        ideas: 'Ideas',
                        polls: 'Polls',
                        events: 'Events',
                      };
                      const target = routeMap[c.key];
                      if (target) {
                        // Close overlay then navigate
                        setSearchOpen(false);
                        // Use parent navigation: go to Social tab with target screen
                        (navigation as any).navigate('SocialTab', { screen: target });
                      }
                    }}
                    accessibilityRole="button"
                  >
                    <Ionicons name={c.icon as any} size={20} color="#ffd166" />
                    <Text style={styles.quickTileText} numberOfLines={2}>{c.label}</Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <TextInput
                value={searchQ}
                onChangeText={setSearchQ}
                onSubmitEditing={() => doSearch()}
                placeholder="اكتب ما تريد البحث عنه… (مذكرات، ملاحظات، جداول الذاكرة، منشورات…)"
                placeholderTextColor="#888"
                style={styles.searchInput}
                accessibilityLabel="Search input"
              />
              <Pressable
                onPress={() => setMode((m) => (m === 'wide' ? 'strict' : 'wide'))}
                style={[styles.searchModeBtn, mode === 'strict' && styles.searchModeBtnActive]}
                accessibilityLabel="Toggle search mode"
              >
                <Text style={[styles.searchModeBtnText, mode === 'strict' && styles.searchModeBtnTextActive]}>
                  {mode === 'wide' ? 'واسع' : 'صارم'}
                </Text>
              </Pressable>
              <Pressable onPress={() => doSearch()} style={styles.searchBtn} accessibilityLabel="Search">
                <Text style={{ color: '#111', fontWeight: '800' }}>بحث</Text>
              </Pressable>
              <Pressable onPress={() => setSearchOpen(false)} style={styles.searchClose} accessibilityLabel="Close">
                <Text style={{ color: '#fff', fontSize: 18 }}>✖</Text>
              </Pressable>
            </View>
            {/* Filters: Where to search */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterRow}
              style={{ marginTop: 10 }}
            >
              {TYPE_OPTIONS.map((t) => {
                const isAll = t.key === 'all';
                const active = isAll ? selectedTypes.length === 0 : selectedTypes.includes(t.key);
                return (
                  <Pressable
                    key={t.key}
                    onPress={() => toggleType(t.key)}
                    style={[styles.filterChip, active && styles.filterChipActive]}
                    accessibilityRole="button"
                    accessibilityLabel={`Filter ${t.label}`}
                  >
                    <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{t.label}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            {!!searchError && <Text style={{ color: '#ff8080', marginTop: 8 }}>{searchError}</Text>}
            {!searchError && selectorAnswer?.final ? (
              <View style={styles.answerWrap}>
                <Text style={styles.answerTitle}>الجواب المقترح</Text>
                <Text style={styles.answerText}>{selectorAnswer.final?.text || ''}</Text>
                {Array.isArray(selectorAnswer.answers) && selectorAnswer.answers.length > 0 ? (
                  <Text style={styles.answerMeta}>
                    مصادر ({selectorAnswer.answers.length}): {selectorAnswer.answers.map((a: any) => a.id).join(', ')}
                  </Text>
                ) : null}
              </View>
            ) : null}
            {searching ? (
              <View style={{ paddingVertical: 20 }}><ActivityIndicator /></View>
            ) : (
              <ScrollView style={{ maxHeight: 320, marginTop: 8 }} contentContainerStyle={{ paddingBottom: 8 }}>
                {(!results || results.length === 0) ? (
                  <Text style={{ color: '#bbb' }}>لا نتائج بعد.</Text>
                ) : results.map((it:any, idx:number) => (
                  <View key={`r-${idx}`} style={styles.resultRow}>
                    <Text style={styles.resultTitle}>{it.title || it.name || (it.text ? String(it.text).slice(0, 80) : `#${it.id}`)}</Text>
                    <Text style={styles.resultMeta}>
                      {(it.type || it.source || it.kind || '').toString()} {it.created_at ? `· ${new Date(it.created_at).toLocaleString()}` : ''}
                    </Text>
                    {it.snippet && <Text style={styles.resultSnippet}>{it.snippet}</Text>}
                  </View>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      )}
    </View>
  );
}

/* Tabs */
function MainTabs() {
  return (
    <Tab.Navigator screenOptions={{ headerShown: false }} tabBar={(props) => <CustomTabBar {...props} />}>
      {/* Left side of plus (from leftmost to near-plus): Explore, Shopping */}
      <Tab.Screen name="ExploreTab"  component={ExploreStackShellWrapper}  options={{ title: 'Explore' }} />
      <Tab.Screen name="ShopTab"     component={ShopStackShellWrapper}     options={{ title: 'Shopping' }} />
      {/* Hidden center trigger */}
      <Tab.Screen
        name="CreateTrigger"
        component={View as any}
        options={{ tabBarButton: () => null, title: 'Create' }}
        listeners={{ tabPress: (e) => e.preventDefault() }}
      />
      {/* Right side of plus (from near-plus to far-right): Social, Personal */}
      <Tab.Screen name="SocialTab"   component={SocialStackShellWrapper}   options={{ title: 'Social' }} />
      <Tab.Screen name="PersonalTab" component={PersonalStackShellWrapper} options={{ title: 'Personal' }} />
    </Tab.Navigator>
  );
}

/* Root shells */
function MainScreen({ navigation }: NativeStackScreenProps<RootStackParamList, 'Main'>) {
  const { user } = useAuth();

  useLayoutEffect(() => {
    navigation.setOptions({
      title: user?.username ? `مرحباً، ${user.username}` : 'Umgram',
      headerRight: () => <LogoutButton />,
    });
  }, [navigation, user]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0f1115' }}>
      <MainTabs />
      <StatusBar style={Platform.OS === 'ios' ? 'light' : 'auto'} />
    </SafeAreaView>
  );
}
function CreateScreen() {
  return (
    <View style={styles.create}>
      <Text style={styles.createTitle}>إنشاء</Text>
      <Text style={styles.createSub}>هنا تضع إجراء النشر/القصة/الرفع…</Text>
    </View>
  );
}
function RootNavigator() {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator />
        <Text style={{ marginTop: 8, color: '#fff' }}>جارِ تحميل الجلسة…</Text>
      </View>
    );
  }
  return (
    <RootStack.Navigator screenOptions={{ headerTitleAlign: 'center' }}>
      {user ? (
        <>
          <RootStack.Screen name="Main" component={MainScreen} options={{ title: 'Umgram' }} />
          <RootStack.Screen name="Create" component={CreateScreen} options={{ presentation: 'modal', title: 'إنشاء' }} />
        </>
      ) : (
        <>
          <RootStack.Screen name="Login" component={LoginScreen} options={{ title: 'تسجيل الدخول' }} />
          <RootStack.Screen name="Register" component={RegisterScreen} options={{ title: 'إنشاء حساب' }} />
        </>
      )}
    </RootStack.Navigator>
  );
}

/* Entrypoint */
export default function App() {
  const [fontsLoaded] = useFonts({ ...Ionicons.font });
  if (!fontsLoaded) return null;

  const paperTheme = MD3DarkTheme;
  return (
    <SafeAreaProvider>
      <PaperProvider theme={paperTheme}>
        <AuthProvider>
          <MemoryTablesProvider>
            <NavigationContainer
              onStateChange={() => { if (Platform.OS === 'web') blurActiveElement(); }}
            >
              <RootNavigator />
            </NavigationContainer>
          </MemoryTablesProvider>
        </AuthProvider>
      </PaperProvider>
    </SafeAreaProvider>
  );
}

/* Styles */
const styles = StyleSheet.create({
  hub: { padding: 16, gap: 12, backgroundColor: '#0f1115' },
  hubTitle: { fontSize: 22, fontWeight: '700', marginBottom: 8, color: '#fff' },
  card: {
    width: '100%', minHeight: 64, borderRadius: 14,
    backgroundColor: '#1c1f24', padding: 16, justifyContent: 'center',
    ...(Platform.OS === 'web'
      ? { boxShadow: '0px 3px 6px rgba(0,0,0,0.08)' as any }
      : { shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 2 }
    ),
  },
  cardPressed: { opacity: 0.8 },
  cardLabel: { fontSize: 16, fontWeight: '700', color: '#fff' },
  cardSub: { marginTop: 4, color: '#a3a3a3' },

  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20, backgroundColor: '#0f1115' },
  placeholderTitle: { fontSize: 24, fontWeight: '800', color: '#fff' },
  placeholderSub: { marginTop: 8, color: '#a0a0a0', textAlign: 'center' },

  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0f1115' },

  tabWrap: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  tabBar: {
    marginHorizontal: 16, marginBottom: 8, backgroundColor: '#0f1115', borderRadius: 28, paddingHorizontal: 14,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    ...(Platform.OS === 'web'
      ? { boxShadow: '0px 6px 16px rgba(0,0,0,0.18)' as any }
      : { shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 10 }
    ),
  },
  tabItem: { alignItems: 'center', justifyContent: 'center', gap: 4, width: 68, height: 64 },
  tabLabel: { fontSize: 11, color: '#c7c7c7' },
  tabLabelActive: { color: '#fff', fontWeight: '700' },

  plusItem: {
    width: 56, height: 36, borderRadius: 18, backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
  },

  // Global prompt search overlay styles
  searchOverlay: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, justifyContent: 'flex-end', zIndex: 1000 },
  searchCard: {
    margin: 16, borderRadius: 16, backgroundColor: '#121419', padding: 12,
    ...(Platform.OS === 'web'
      ? { boxShadow: '0px 8px 22px rgba(0,0,0,0.35)' as any }
      : { shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 22, shadowOffset: { width: 0, height: 12 }, elevation: 14 }
    ),
  },
  searchInput: {
    flex: 1, backgroundColor: '#1b1f26', color: '#fff', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth, borderColor: '#2c313a', marginRight: 8,
  },
  searchBtn: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, backgroundColor: '#ffd166' },
  searchClose: { marginLeft: 8, width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: '#2a2f38' },
  resultRow: { paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#2a2f38' },
  resultTitle: { color: '#fff', fontWeight: '700' },
  resultMeta: { color: '#9aa0a6', fontSize: 12, marginTop: 2 },
  resultSnippet: { color: '#d7d7d7', marginTop: 4 },

  // Filter chips for search overlay
  filterRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, paddingTop: 6, paddingBottom: 2 },
  filterChip: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 12,
    borderRadius: 14, backgroundColor: '#1b1f26', borderWidth: StyleSheet.hairlineWidth, borderColor: '#2c313a',
  },
  filterChipActive: { backgroundColor: '#ffd166', borderColor: '#ffd166' },
  filterChipText: { color: '#e5e7eb', fontWeight: '600', fontSize: 12 },
  filterChipTextActive: { color: '#111' },

  // Answer selector panel
  answerWrap: { marginTop: 10, padding: 10, borderRadius: 10, backgroundColor: '#0f1115', borderWidth: StyleSheet.hairlineWidth, borderColor: '#2a2f38' },
  answerTitle: { color: '#fff', fontWeight: '700', marginBottom: 4 },
  answerText: { color: '#d7d7d7' },
  answerMeta: { color: '#9aa0a6', fontSize: 12, marginTop: 4 },

  // Mode toggle button
  searchModeBtn: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10, backgroundColor: '#1b1f26', marginRight: 8, borderWidth: StyleSheet.hairlineWidth, borderColor: '#2c313a' },
  searchModeBtnActive: { backgroundColor: '#0b5ed7', borderColor: '#0b5ed7' },
  searchModeBtnText: { color: '#e5e7eb', fontWeight: '700' },
  searchModeBtnTextActive: { color: '#fff' },

  // Quick category grid
  quickBox: { marginBottom: 10 },
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  quickTile: {
    width: '32%',
    aspectRatio: 1.2,
    marginBottom: 8,
    borderRadius: 12,
    backgroundColor: '#1b1f26',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#2c313a',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 6,
  },
  quickTileText: { color: '#e5e7eb', fontWeight: '700', textAlign: 'center', marginTop: 6, fontSize: 12 },

  chipsWrap: { position: 'absolute', left: 0, right: 0, paddingHorizontal: 12 },
  chipsRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, paddingVertical: 6 },
  chip: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 14,
    borderRadius: 16, backgroundColor: '#f1f2f6', borderWidth: StyleSheet.hairlineWidth, borderColor: '#e5e7eb',
  },
  chipActive: { backgroundColor: '#111', borderColor: '#111' },
  chipText: { color: '#111', fontWeight: '600', fontSize: 13 },
  chipTextActive: { color: '#fff' },

  create: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20, backgroundColor: '#0f1115' },
  createTitle: { fontSize: 24, fontWeight: '800', color: '#fff' },
  createSub: { marginTop: 8, color: '#a0a0a0', textAlign: 'center' },
});

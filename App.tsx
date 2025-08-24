// App.tsx
import React, { useLayoutEffect, useMemo, useRef } from 'react';
import {
  View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator, SafeAreaView, Platform, Animated
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import {
  NavigationContainer,
  getFocusedRouteNameFromRoute,
  type RouteProp
} from '@react-navigation/native';
import { createNativeStackNavigator, NativeStackScreenProps } from '@react-navigation/native-stack';
import { createBottomTabNavigator, BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFonts } from 'expo-font';

import { AuthProvider, useAuth } from './src/auth/AuthContext';
import LoginScreen from './src/screens/LoginScreen';
import RegisterScreen from './src/screens/RegisterScreen';
import DiarysScreen from './src/screens/DiarysScreen';

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
  Chat: undefined;
  MicroblogX: undefined;
  VideoFeed: undefined;
  Confession: undefined; // فضفضة
};
type PersonalStackParamList = {
  PersonalHub: undefined;
  Diary: undefined;
  Notes: undefined;
  Album: undefined;
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
const ChatScreen        = () => <Placeholder title="Chat" />;
const MicroblogXScreen  = () => <Placeholder title="X-like (Microblog)" />;
const VideoFeedScreen   = () => <Placeholder title="TikTok-like (Video Feed)" />;
const ConfessionScreen  = () => <Placeholder title="فضفضة" />;
// Use the real DiarysScreen for Diary page
const DiaryScreen = DiarysScreen;
const NotesScreen       = () => <Placeholder title="Notes" />;
const AlbumScreen       = () => <Placeholder title="Album" />;
const LinkScreen        = () => <Placeholder title="ربط" />;
const MapScreen         = () => <Placeholder title="Map" />;
const ShoppingScreen    = () => <Placeholder title="Shopping" />;

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
  const pressIn  = () => Animated.spring(scale, { toValue: 0.96, useNativeDriver: true, speed: 20, bounciness: 6 }).start();
  const pressOut = () => Animated.spring(scale, { toValue: 1,    useNativeDriver: true, speed: 20, bounciness: 6 }).start();
  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable onPressIn={pressIn} onPressOut={pressOut} onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
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
    <View style={[styles.chipsWrap, { bottom: containerBottom }]} pointerEvents="box-none">
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
      <GridButton label="Chat" onPress={() => navigation.navigate('Chat')} />
      <GridButton label="X-like (Microblog)" onPress={() => navigation.navigate('MicroblogX')} />
      <GridButton label="TikTok-like (Video)" onPress={() => navigation.navigate('VideoFeed')} />
      <GridButton label="فضفضة" onPress={() => navigation.navigate('Confession')} />
    </ScrollView>
  );
}
function PersonalHubScreen({ navigation }: any) {
  return (
    <ScrollView contentContainerStyle={[styles.hub, { paddingBottom: BAR_HEIGHT + CHIPS_HEIGHT + 48 }]}>
      <Text style={styles.hubTitle}>Personal</Text>
      <GridButton label="Diary" onPress={() => navigation.navigate('Diary')} />
      <GridButton label="Notes" onPress={() => navigation.navigate('Notes')} />
      <GridButton label="Album" onPress={() => navigation.navigate('Album')} />
      <GridButton label="ربط" onPress={() => navigation.navigate('Link')} />
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
    { key: 'microblog', label: 'منشورات',   route: 'MicroblogX', icon: 'megaphone-outline' },
    { key: 'video',     label: 'فيديو قصير', route: 'VideoFeed',  icon: 'videocam-outline' },
    { key: 'confess',   label: 'فضفضة',      route: 'Confession', icon: 'chatbubble-ellipses-outline' },
  ];
  const activeChild = getFocusedRouteNameFromRoute(route) as string | undefined;

  return (
    <View style={{ flex: 1 }}>
      <SocialStack.Navigator screenOptions={{ headerShown: false }}>
        <SocialStack.Screen name="SocialHub" component={SocialHubScreen} />
        <SocialStack.Screen name="Chat" component={ChatScreen} />
        <SocialStack.Screen name="MicroblogX" component={MicroblogXScreen} />
        <SocialStack.Screen name="VideoFeed" component={VideoFeedScreen} />
        <SocialStack.Screen name="Confession" component={ConfessionScreen} />
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
    { key: 'album', label: 'ألبوم',   route: 'Album',  icon: 'images-outline' },
    { key: 'link',  label: 'ربط',     route: 'Link',   icon: 'link-outline' },
  ];
  const activeChild = getFocusedRouteNameFromRoute(route) as string | undefined;

  return (
    <View style={{ flex: 1 }}>
      <PersonalStack.Navigator screenOptions={{ headerShown: false }}>
        <PersonalStack.Screen name="PersonalHub" component={PersonalHubScreen} />
        <PersonalStack.Screen name="Diary" component={DiaryScreen} />
        <PersonalStack.Screen name="Notes" component={NotesScreen} />
        <PersonalStack.Screen name="Album" component={AlbumScreen} />
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
          const onPress = () => navigation.navigate(route.name as never);
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
          onPress={() => navigation.getParent()?.navigate('Create' as never)}
          style={({ pressed }) => [styles.plusItem, pressed && { opacity: 0.85 }]}
          accessibilityLabel="Create"
          accessibilityRole="button"
        >
          <Ionicons name="add" size={24} color="#111" />
        </Pressable>

        {routes.slice(3, 5).map((route, i) => {
          const idxGlobal = i + 3;
          const isFocused = focusedIndex === idxGlobal;
          const onPress = () => navigation.navigate(route.name as never);
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
    </View>
  );
}

/* Tabs */
function MainTabs() {
  return (
    <Tab.Navigator screenOptions={{ headerShown: false }} tabBar={(props) => <CustomTabBar {...props} />}>
      <Tab.Screen name="SocialTab"   component={SocialStackShellWrapper}   options={{ title: 'اجتماعي' }} />
      <Tab.Screen name="PersonalTab" component={PersonalStackShellWrapper} options={{ title: 'شخصي' }} />
      <Tab.Screen
        name="CreateTrigger"
        component={View as any}
        options={{ tabBarButton: () => null, title: 'Create' }}
        listeners={{ tabPress: (e) => e.preventDefault() }}
      />
      <Tab.Screen name="ExploreTab"  component={ExploreStackShellWrapper}  options={{ title: 'استكشاف' }} />
      <Tab.Screen name="ShopTab"     component={ShopStackShellWrapper}     options={{ title: 'تسوّق' }} />
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

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <NavigationContainer>
          <RootNavigator />
        </NavigationContainer>
      </AuthProvider>
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
    shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 2,
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
    shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 10,
  },
  tabItem: { alignItems: 'center', justifyContent: 'center', gap: 4, width: 68, height: 64 },
  tabLabel: { fontSize: 11, color: '#c7c7c7' },
  tabLabelActive: { color: '#fff', fontWeight: '700' },

  plusItem: {
    width: 56, height: 36, borderRadius: 18, backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
  },

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

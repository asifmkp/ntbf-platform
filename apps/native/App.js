import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList, ScrollView,
  StyleSheet, ActivityIndicator, StatusBar, KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import catalog from './catalog.json';

const API = 'https://ntbf-platform.onrender.com';
const PRODUCTS = catalog.filter((p) => p.price > 0);
const aed = (n) => 'AED ' + (Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function api(path, method, body, token) {
  const headers = { 'content-type': 'application/json' };
  if (token) headers['authorization'] = 'Bearer ' + token;
  const res = await fetch(API + path, { method: method || 'GET', headers, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data && data.message) || ('Error ' + res.status));
  return data;
}

export default function App() {
  const [booting, setBooting] = useState(true);
  const [token, setToken] = useState(null);
  const [customer, setCustomer] = useState(null);

  useEffect(() => {
    (async () => {
      const t = await AsyncStorage.getItem('token');
      const c = await AsyncStorage.getItem('customer');
      if (t) { setToken(t); setCustomer(c ? JSON.parse(c) : null); }
      setBooting(false);
    })();
  }, []);

  async function signIn(tok, cust) {
    await AsyncStorage.setItem('token', tok);
    await AsyncStorage.setItem('customer', JSON.stringify(cust));
    setToken(tok); setCustomer(cust);
  }
  async function signOut() {
    await AsyncStorage.multiRemove(['token', 'customer']);
    setToken(null); setCustomer(null);
  }

  if (booting) return <View style={s.center}><ActivityIndicator size="large" color="#0a66c2" /></View>;
  if (!token) return <AuthScreen onSignIn={signIn} />;
  return <Main token={token} customer={customer} onSignOut={signOut} />;
}

function AuthScreen({ onSignIn }) {
  const [mode, setMode] = useState('login');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const isLogin = mode === 'login';

  async function submit() {
    if (!phone || !password) return Alert.alert('Missing info', 'Enter phone and password.');
    if (!isLogin && !name) return Alert.alert('Missing info', 'Enter your business name.');
    setBusy(true);
    try {
      const r = isLogin
        ? await api('/api/portal/login', 'POST', { phone, password })
        : await api('/api/portal/register', 'POST', { name, phone, password });
      onSignIn(r.token, r.customer);
    } catch (e) { Alert.alert('Sign-in failed', e.message); }
    setBusy(false);
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: '#f4f6f9' }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar barStyle="light-content" />
      <View style={s.hero}>
        <Text style={s.heroTitle}>National Trading</Text>
        <Text style={s.heroSub}>Order beverages & foodstuff · Ajman, UAE</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 18 }}>
        <View style={s.card}>
          <Text style={s.h3}>{isLogin ? 'Sign in' : 'Create account'}</Text>
          {!isLogin && <Field label="Business name" value={name} onChangeText={setName} placeholder="Corner Shop LLC" />}
          <Field label="Phone" value={phone} onChangeText={setPhone} placeholder="+9715..." keyboardType="phone-pad" />
          <Field label="Password" value={password} onChangeText={setPassword} placeholder="At least 4 characters" secureTextEntry />
          <TouchableOpacity style={s.btn} onPress={submit} disabled={busy}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>{isLogin ? 'Sign in' : 'Create account'}</Text>}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setMode(isLogin ? 'register' : 'login')}>
            <Text style={s.link}>{isLogin ? 'New customer? Create an account' : 'Already have an account? Sign in'}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Main({ token, customer, onSignOut }) {
  const [tab, setTab] = useState('shop');
  const [cart, setCart] = useState({});
  const cartCount = Object.values(cart).reduce((s, v) => s + v.qty, 0);
  const cartTotal = Object.values(cart).reduce((s, v) => s + v.qty * v.price, 0);

  return (
    <View style={{ flex: 1, backgroundColor: '#f4f6f9' }}>
      <StatusBar barStyle="light-content" />
      <View style={s.topbar}>
        <View>
          <Text style={s.topTitle}>National Trading</Text>
          <Text style={s.topSub}>{customer ? customer.name : ''}</Text>
        </View>
        <TouchableOpacity onPress={onSignOut}><Text style={s.signout}>Sign out</Text></TouchableOpacity>
      </View>

      {tab === 'shop'
        ? <Shop cart={cart} setCart={setCart} />
        : <Orders token={token} />}

      {tab === 'shop' && cartCount > 0 && (
        <View style={s.cartbar}>
          <View style={{ flex: 1 }}>
            <Text style={s.cartTotal}>{aed(cartTotal)}</Text>
            <Text style={s.cartSub}>{cartCount} item{cartCount === 1 ? '' : 's'}</Text>
          </View>
          <PlaceOrder cart={cart} setCart={setCart} token={token} onDone={() => setTab('orders')} />
        </View>
      )}

      <View style={s.tabs}>
        <Tab label="🛒 Shop" active={tab === 'shop'} onPress={() => setTab('shop')} />
        <Tab label="▣ My orders" active={tab === 'orders'} onPress={() => setTab('orders')} />
      </View>
    </View>
  );
}

function Shop({ cart, setCart }) {
  const [q, setQ] = useState('');
  const list = useMemo(() => {
    const query = q.toLowerCase();
    return PRODUCTS.filter((p) => p.name.toLowerCase().includes(query)).slice(0, 120);
  }, [q]);
  const set = (id, p, delta) => setCart((c) => {
    const cur = c[id] ? c[id].qty : 0;
    const qty = Math.max(0, cur + delta);
    const next = { ...c };
    if (qty === 0) delete next[id]; else next[id] = { qty, price: p.price, name: p.name };
    return next;
  });

  return (
    <View style={{ flex: 1 }}>
      <View style={{ padding: 12 }}>
        <TextInput style={s.search} placeholder={`Search ${PRODUCTS.length} products…`} value={q} onChangeText={setQ} />
      </View>
      <FlatList
        data={list}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 140 }}
        renderItem={({ item: p }) => {
          const qv = cart[p.id] ? cart[p.id].qty : 0;
          return (
            <View style={s.prod}>
              <View style={{ flex: 1 }}>
                <Text style={s.prodName} numberOfLines={1}>{p.name}</Text>
                <Text style={s.prodSub}>{aed(p.price)} · {p.unit || ''}</Text>
              </View>
              <View style={s.qtc}>
                <TouchableOpacity style={s.qBtn} onPress={() => set(p.id, p, -1)}><Text style={s.qBtnT}>−</Text></TouchableOpacity>
                <Text style={s.qNum}>{qv}</Text>
                <TouchableOpacity style={[s.qBtn, s.qBtnAdd]} onPress={() => set(p.id, p, 1)}><Text style={[s.qBtnT, { color: '#fff' }]}>+</Text></TouchableOpacity>
              </View>
            </View>
          );
        }}
      />
    </View>
  );
}

function PlaceOrder({ cart, setCart, token, onDone }) {
  const [busy, setBusy] = useState(false);
  async function place() {
    const items = Object.entries(cart).map(([, v]) => ({ name: v.name, qty: v.qty, price: v.price }));
    setBusy(true);
    try {
      const o = await api('/api/portal/orders', 'POST', { items, method: 'CASH_ON_DELIVERY' }, token);
      setCart({});
      Alert.alert('Order placed', `${o.id} — ${aed(o.total)}`);
      onDone();
    } catch (e) { Alert.alert('Could not place order', e.message); }
    setBusy(false);
  }
  return (
    <TouchableOpacity style={s.orderBtn} onPress={place} disabled={busy}>
      {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Place order</Text>}
    </TouchableOpacity>
  );
}

function Orders({ token }) {
  const [orders, setOrders] = useState(null);
  const track = { PLACED: 'Order received', CONFIRMED: 'Confirmed', PACKED: 'Preparing', OUT_FOR_DELIVERY: 'Out for delivery', DELIVERED: 'Delivered' };
  useEffect(() => { (async () => { try { setOrders(await api('/api/portal/orders', 'GET', null, token)); } catch (e) { setOrders([]); } })(); }, []);
  if (!orders) return <View style={s.center}><ActivityIndicator color="#0a66c2" /></View>;
  return (
    <FlatList
      data={orders}
      keyExtractor={(o) => o.id}
      contentContainerStyle={{ padding: 14, paddingBottom: 90 }}
      ListEmptyComponent={<Text style={s.empty}>No orders yet — start shopping.</Text>}
      renderItem={({ item: o }) => (
        <View style={s.card}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ fontWeight: '700', color: '#12202e' }}>{o.id}</Text>
            <Text style={s.badge}>{track[o.status] || o.status}</Text>
          </View>
          <Text style={s.prodSub}>{o.items.length} item(s) · {aed(o.total)} · {new Date(o.createdAt).toLocaleDateString()}</Text>
        </View>
      )}
    />
  );
}

function Field({ label, ...props }) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={s.label}>{label}</Text>
      <TextInput style={s.input} placeholderTextColor="#9aa7b2" autoCapitalize="none" {...props} />
    </View>
  );
}
function Tab({ label, active, onPress }) {
  return <TouchableOpacity style={s.tab} onPress={onPress}><Text style={[s.tabT, active && s.tabTActive]}>{label}</Text></TouchableOpacity>;
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f4f6f9' },
  hero: { backgroundColor: '#0a66c2', paddingTop: 60, paddingBottom: 22, paddingHorizontal: 20 },
  heroTitle: { color: '#fff', fontSize: 24, fontWeight: '800' },
  heroSub: { color: '#cfe0f5', fontSize: 13, marginTop: 3 },
  topbar: { backgroundColor: '#0a66c2', paddingTop: 52, paddingBottom: 14, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  topTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
  topSub: { color: '#cfe0f5', fontSize: 12 },
  signout: { color: '#fff', fontSize: 13, backgroundColor: 'rgba(255,255,255,0.18)', paddingVertical: 5, paddingHorizontal: 11, borderRadius: 20, overflow: 'hidden' },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#e6eaef' },
  h3: { fontSize: 17, fontWeight: '700', marginBottom: 14, color: '#12202e' },
  label: { fontSize: 12, color: '#7c8a99', marginBottom: 5, fontWeight: '600' },
  input: { borderWidth: 1, borderColor: '#e6eaef', borderRadius: 10, padding: 12, fontSize: 15, backgroundColor: '#f8fafc', color: '#12202e' },
  btn: { backgroundColor: '#0a66c2', borderRadius: 11, padding: 14, alignItems: 'center', marginTop: 6 },
  btnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  link: { color: '#0a66c2', textAlign: 'center', marginTop: 14, fontSize: 13.5 },
  search: { borderWidth: 1, borderColor: '#e6eaef', borderRadius: 10, padding: 11, fontSize: 15, backgroundColor: '#fff', color: '#12202e' },
  prod: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: '#eef1f4' },
  prodName: { fontSize: 14, fontWeight: '600', color: '#12202e' },
  prodSub: { fontSize: 12.5, color: '#7c8a99', marginTop: 2 },
  qtc: { flexDirection: 'row', alignItems: 'center' },
  qBtn: { width: 34, height: 34, borderRadius: 9, borderWidth: 1, borderColor: '#e6eaef', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f8fafc' },
  qBtnAdd: { backgroundColor: '#0a66c2', borderColor: '#0a66c2' },
  qBtnT: { fontSize: 20, color: '#12202e', marginTop: -2 },
  qNum: { minWidth: 30, textAlign: 'center', fontSize: 15, fontWeight: '700', color: '#12202e' },
  cartbar: { position: 'absolute', left: 0, right: 0, bottom: 58, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#e6eaef', flexDirection: 'row', alignItems: 'center', padding: 12, gap: 12 },
  cartTotal: { fontSize: 17, fontWeight: '800', color: '#12202e' },
  cartSub: { fontSize: 12, color: '#7c8a99' },
  orderBtn: { backgroundColor: '#0a66c2', borderRadius: 11, paddingVertical: 12, paddingHorizontal: 20, alignItems: 'center' },
  tabs: { flexDirection: 'row', backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#e6eaef' },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabT: { fontSize: 13, color: '#7c8a99', fontWeight: '600' },
  tabTActive: { color: '#0a66c2' },
  badge: { fontSize: 11, fontWeight: '700', color: '#0a66c2', backgroundColor: '#e8f1ff', paddingVertical: 2, paddingHorizontal: 9, borderRadius: 20, overflow: 'hidden' },
  empty: { textAlign: 'center', color: '#7c8a99', padding: 30 },
});

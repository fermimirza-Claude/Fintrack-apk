import React, { useEffect, useLayoutEffect, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp, useData } from '../state/AppContext';
import { Button, Card, Field, IconBadge, Input, ListItem, Loading, Row, Screen, SectionHeader, Segmented, SwitchRow, Txt } from '../ui/components';
import { ValidationError } from '../db/repo';
import type { RootScreen } from '../navigation/types';
import { radius, space } from '../ui/theme';

const ICONS = [
  'restaurant-outline', 'cafe-outline', 'car-outline', 'bus-outline', 'bag-handle-outline', 'cart-outline', 'flash-outline', 'water-outline',
  'wifi-outline', 'home-outline', 'medkit-outline', 'fitness-outline', 'school-outline', 'book-outline', 'film-outline', 'game-controller-outline',
  'airplane-outline', 'card-outline', 'trending-up-outline', 'gift-outline', 'briefcase-outline', 'storefront-outline', 'laptop-outline', 'paw-outline',
  'shirt-outline', 'heart-outline', 'people-outline', 'receipt-outline', 'stats-chart-outline', 'pricetag-outline', 'ellipsis-horizontal-outline', 'add-circle-outline',
];
const COLORS = ['#F97362', '#3B82F6', '#A855F7', '#F59E0B', '#14B8A6', '#EF4444', '#6366F1', '#EC4899', '#64748B', '#10B981', '#16A34A', '#0EA5E9', '#84CC16', '#78716C'];

export function CategoriesScreen({ navigation }: RootScreen<'Categories'>) {
  const { colors: c } = useApp();
  const [kind, setKind] = useState<'expense' | 'income'>('expense');
  const data = useData((r) => r.listCategories(kind, true), [kind]);
  const cats = data.data ?? [];
  const parents = cats.filter((x) => !x.parentId && !x.isArchived);
  const archived = cats.filter((x) => x.isArchived);
  return (
    <Screen>
      <Segmented value={kind} onChange={setKind} options={[{ value: 'expense', label: 'Pengeluaran' }, { value: 'income', label: 'Pemasukan' }]} style={{ marginBottom: space.md }} />
      <Button title="Tambah kategori" icon="add" onPress={() => navigation.navigate('CategoryForm', { kind })} style={{ marginBottom: space.md }} />
      {!data.data ? <Loading /> : parents.map((p) => {
        const subs = cats.filter((s) => s.parentId === p.id && !s.isArchived);
        return (
          <Card key={p.id}>
            <ListItem icon={p.icon} iconColor={p.color} title={p.name} subtitle={subs.length ? `${subs.length} subkategori` : 'Tanpa subkategori'} onPress={() => navigation.navigate('CategoryForm', { id: p.id, kind })} last={!subs.length} />
            {subs.map((s) => (
              <View key={s.id} style={{ paddingLeft: 48 }}>
                <ListItem title={s.name} onPress={() => navigation.navigate('CategoryForm', { id: s.id, kind, parentId: p.id })} />
              </View>
            ))}
            <Pressable onPress={() => navigation.navigate('CategoryForm', { kind, parentId: p.id })} style={{ paddingLeft: 48, paddingTop: 10 }}>
              <Txt v="smallStrong" color={c.accent}>+ Subkategori</Txt>
            </Pressable>
          </Card>
        );
      })}
      {archived.length ? (
        <>
          <SectionHeader title="Diarsipkan" subtitle="Tetap tampil di riwayat, tidak muncul saat mencatat" />
          <Card>
            {archived.map((a, i) => <ListItem key={a.id} icon={a.icon} iconColor={a.color} title={a.name} onPress={() => navigation.navigate('CategoryForm', { id: a.id, kind, parentId: a.parentId })} last={i === archived.length - 1} />)}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

export function CategoryFormScreen({ route, navigation }: RootScreen<'CategoryForm'>) {
  const { repo, colors: c, notifyDataChanged } = useApp();
  const { id, kind, parentId } = route.params;
  const [name, setName] = useState('');
  const [icon, setIcon] = useState(kind === 'income' ? 'briefcase-outline' : 'pricetag-outline');
  const [color, setColor] = useState(COLORS[0]);
  const [archived, setArchived] = useState(false);
  const [parentName, setParentName] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useLayoutEffect(() => navigation.setOptions({ title: id ? 'Ubah kategori' : parentId ? 'Subkategori baru' : 'Kategori baru' }), [navigation, id, parentId]);
  useEffect(() => {
    (async () => {
      const all = await repo.listCategories(undefined, true);
      if (parentId) {
        const p = all.find((x) => x.id === parentId);
        setParentName(p?.name ?? null);
        if (p && !id) { setIcon(p.icon); setColor(p.color); }
      }
      if (id) {
        const x = all.find((k) => k.id === id);
        if (x) { setName(x.name); setIcon(x.icon); setColor(x.color); setArchived(x.isArchived); }
      }
    })();
  }, [id, parentId, repo]);

  const save = async () => {
    try {
      if (id) await repo.updateCategory(id, { name, icon, color, isArchived: archived });
      else await repo.createCategory({ name, kind, icon, color, parentId: parentId ?? null });
      notifyDataChanged();
      navigation.goBack();
    } catch (e: any) { setErr(e instanceof ValidationError ? e.message : String(e?.message ?? e)); }
  };

  const remove = async () => {
    const used = await repo.categoryUsage(id!);
    if (used > 0) {
      Alert.alert('Kategori sedang dipakai', `Kategori ini dipakai ${used} transaksi. Arsipkan agar riwayat tetap utuh.`, [
        { text: 'Batal', style: 'cancel' },
        { text: 'Arsipkan', onPress: async () => { await repo.updateCategory(id!, { isArchived: true }); notifyDataChanged(); navigation.goBack(); } },
      ]);
      return;
    }
    Alert.alert('Hapus kategori?', parentId ? undefined : 'Subkategori dan anggaran kategori ini juga akan dihapus.', [
      { text: 'Batal', style: 'cancel' },
      { text: 'Hapus', style: 'destructive', onPress: async () => { await repo.deleteCategory(id!); notifyDataChanged(); navigation.goBack(); } },
    ]);
  };

  return (
    <Screen>
      <Row style={{ marginBottom: space.lg }}>
        <IconBadge icon={icon} color={color} size={52} />
        <View style={{ flex: 1 }}>
          <Txt v="h3">{name || 'Nama kategori'}</Txt>
          <Txt v="small">{kind === 'income' ? 'Pemasukan' : 'Pengeluaran'}{parentName ? ` · sub dari ${parentName}` : ''}</Txt>
        </View>
      </Row>
      <Field label="Nama" error={err}>
        <Input value={name} onChangeText={(t) => { setName(t); setErr(null); }} placeholder="Contoh: Kopi" maxLength={40} />
      </Field>
      {!parentId ? (
        <>
          <Field label="Ikon">
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {ICONS.map((ic) => (
                <Pressable key={ic} onPress={() => setIcon(ic)} accessibilityLabel={ic}
                  style={{ width: 44, height: 44, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: icon === ic ? color + '33' : c.surface, borderWidth: 1, borderColor: icon === ic ? color : c.border }}>
                  <Ionicons name={ic as any} size={20} color={icon === ic ? color : c.textMuted} />
                </Pressable>
              ))}
            </View>
          </Field>
          <Field label="Warna">
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {COLORS.map((col) => (
                <Pressable key={col} onPress={() => setColor(col)} accessibilityLabel={`Warna ${col}`}
                  style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: col, alignItems: 'center', justifyContent: 'center', borderWidth: color === col ? 3 : 0, borderColor: c.text }}>
                  {color === col ? <Ionicons name="checkmark" size={16} color="#FFF" /> : null}
                </Pressable>
              ))}
            </View>
          </Field>
        </>
      ) : null}
      {id ? <SwitchRow label="Arsipkan" hint="Sembunyikan saat mencatat transaksi baru" value={archived} onChange={setArchived} /> : null}
      <Button title="Simpan" icon="checkmark" onPress={save} style={{ marginTop: space.md }} />
      {id ? <Button title="Hapus kategori" variant="ghost" onPress={remove} style={{ marginTop: space.sm }} /> : null}
    </Screen>
  );
}

import type { Repo } from '../db/repo';
import { addDays, shiftMonth, todayJakarta } from '../domain/dates';

/**
 * Fills sample data flagged is_demo = 1 so it can be removed later in one tap
 * (Pengaturan → Data contoh → Hapus). Never mixed silently with real data.
 */
export async function loadDemoData(repo: Repo): Promise<number> {
  const db = repo.raw;
  let seed = 42;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
  const round = (n: number) => Math.round(n / 500) * 500;

  const bank = await repo.createAccount({ name: 'BCA (contoh)', type: 'bank', openingBalance: 8_500_000, color: '#2563EB', isDemo: true });
  const wallet = await repo.createAccount({ name: 'GoPay (contoh)', type: 'ewallet', openingBalance: 1_200_000, color: '#0FA3A3', isDemo: true });
  const cc = await repo.createAccount({ name: 'Kartu Kredit (contoh)', type: 'credit_card', openingBalance: 0, color: '#F97362', isDemo: true });
  const cash = await repo.createAccount({ name: 'Tunai (contoh)', type: 'cash', openingBalance: 1_500_000, color: '#16A34A', isDemo: true });

  const today = todayJakarta();
  const start = shiftMonth(today.slice(0, 7), -2) + '-01';
  let n = 0;
  {
    let d = start;
    while (d <= today) {
      const day = parseInt(d.slice(8, 10), 10);
      if (day === 25) {
        await repo.createTransaction({ type: 'income', amount: 9_500_000, title: 'Gaji bulanan', categoryId: 'cat_salary', accountId: bank, date: d, time: '09:00', paymentMethod: 'transfer', isDemo: true });
        await repo.createTransaction({ type: 'transfer', amount: 1_500_000, title: 'Isi saldo GoPay', categoryId: null, accountId: bank, toAccountId: wallet, fee: 1_000, date: d, time: '10:00', isDemo: true });
        n += 2;
      }
      if (day === 1) {
        await repo.createTransaction({ type: 'expense', amount: 2_500_000, title: 'Sewa kos', categoryId: 'cat_household_1', accountId: bank, date: d, time: '08:00', paymentMethod: 'transfer', isDemo: true });
        await repo.createTransaction({ type: 'expense', amount: 350_000, title: 'Internet rumah', categoryId: 'cat_bills_3', accountId: bank, date: d, time: '08:10', paymentMethod: 'transfer', isDemo: true });
        n += 2;
      }
      if (day === 26) {
        await repo.createTransaction({ type: 'transfer', amount: 1_500_000, title: 'Tarik tunai ATM', categoryId: null, accountId: bank, toAccountId: cash, date: d, time: '11:00', isDemo: true });
        n++;
      }
      if (day === 10) {
        await repo.createTransaction({ type: 'transfer', amount: 1_200_000, title: 'Bayar tagihan kartu kredit', categoryId: null, accountId: bank, toAccountId: cc, date: d, time: '12:00', isDemo: true });
        n++;
      }
      const meals = 1 + Math.floor(rnd() * 2);
      for (let i = 0; i < meals; i++) {
        await repo.createTransaction({
          type: 'expense', amount: round(18_000 + rnd() * 50_000), title: pick(['Makan siang', 'Nasi padang', 'Kopi susu', 'Bakso', 'Sarapan']),
          categoryId: pick(['cat_food_1', 'cat_food_3']), accountId: pick([wallet, cash]), date: d, time: i ? '19:00' : '12:15',
          paymentMethod: pick(['qris', 'cash', 'ewallet']), isDemo: true,
        });
        n++;
      }
      if (rnd() < 0.45) {
        await repo.createTransaction({ type: 'expense', amount: round(12_000 + rnd() * 30_000), title: pick(['Ojek online', 'KRL', 'Parkir']), categoryId: pick(['cat_transport_2', 'cat_transport_4', 'cat_transport_3']), accountId: wallet, date: d, time: '07:45', paymentMethod: 'ewallet', isDemo: true });
        n++;
      }
      if (rnd() < 0.12) {
        await repo.createTransaction({ type: 'expense', amount: round(150_000 + rnd() * 450_000), title: pick(['Belanja bulanan', 'Baju', 'Skincare']), categoryId: pick(['cat_food_2', 'cat_shopping_1', 'cat_shopping_3']), accountId: cc, date: d, time: '16:30', paymentMethod: 'credit', isDemo: true });
        n++;
      }
      if (rnd() < 0.06) {
        await repo.createTransaction({ type: 'expense', amount: round(60_000 + rnd() * 200_000), title: pick(['Nonton bioskop', 'Langganan musik', 'Main game']), categoryId: pick(['cat_entertainment_1', 'cat_entertainment_3']), accountId: cc, date: d, time: '20:00', paymentMethod: 'credit', isDemo: true });
        n++;
      }
      d = addDays(d, 1);
    }
    const month = today.slice(0, 7);
    const budgets: [string, number][] = [['cat_food', 2_000_000], ['cat_transport', 800_000], ['cat_entertainment', 500_000], ['cat_shopping', 1_000_000]];
    for (const [cat, amt] of budgets) {
      await db.run('INSERT OR IGNORE INTO budgets (id, month, category_id, amount) VALUES (?,?,?,?)', [`demo_${month}_${cat}`, month, cat, amt]);
    }
  }
  await repo.saveRecurring({
    type: 'expense', amount: 54_990, title: 'Langganan streaming (contoh)', categoryId: 'cat_entertainment_1', accountId: cc,
    paymentMethod: 'credit', frequency: 'monthly', interval: 1, startDate: addDays(today, 3), autoPost: false, remind: false, isDemo: true,
  });
  return n;
}

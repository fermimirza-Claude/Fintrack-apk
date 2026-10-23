import type { ReportData } from './dashboard';
import { formatRupiah, formatPercent } from '../domain/money';
import { formatDate, nowTimeJakarta, todayJakarta } from '../domain/dates';
import { PAYMENT_METHOD_LABEL, type PaymentMethod } from '../domain/types';

const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]!));

/** Printable HTML (A4) for expo-print. All numbers come from ReportData computed from the database. */
export function buildReportHtml(d: ReportData): string {
  const totalExp = d.totals.expense || 1;
  const catRows = d.categories.map((c) => `<tr><td><span class="dot" style="background:${c.color}"></span>${esc(c.name)}</td><td class="r">${formatRupiah(c.amount)}</td><td class="r">${formatPercent((c.amount / totalExp) * 100, 1)}</td></tr>`).join('');
  const bucketRows = d.buckets.filter((b) => b.income || b.expense).map((b) => `<tr><td>${esc(b.longLabel)}</td><td class="r in">${formatRupiah(b.income)}</td><td class="r out">${formatRupiah(b.expense)}</td><td class="r">${formatRupiah(b.net, { sign: true })}</td></tr>`).join('');
  const topRows = d.topExpenses.map((t) => `<tr><td>${formatDate(t.date)}</td><td>${esc(t.title)}</td><td>${esc(t.categoryName ?? '')}</td><td class="r out">${formatRupiah(t.amount)}</td></tr>`).join('');
  const accRows = d.byAccount.map((a) => `<tr><td>${esc(a.name)}</td><td class="r">${formatRupiah(a.amount)}</td></tr>`).join('');
  const methodRows = d.byMethod.map((m) => `<tr><td>${esc(m.method ? PAYMENT_METHOD_LABEL[m.method as PaymentMethod] ?? m.method : 'Tidak diisi')}</td><td class="r">${formatRupiah(m.amount)}</td></tr>`).join('');
  const insights = d.insights.map((i) => `<li>${i.kind === 'projection' ? '<b>[Proyeksi]</b> ' : ''}${esc(i.text)} <span class="muted">${esc(i.basis)}</span></li>`).join('');
  const change = (v: number | null) => (v === null ? '—' : `${v >= 0 ? '+' : '−'}${formatPercent(Math.abs(v))}`);
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body{font-family:-apple-system,Roboto,Helvetica,Arial,sans-serif;color:#0B1F3A;margin:28px;font-size:12px}
    h1{font-size:22px;margin:0}h2{font-size:15px;margin:22px 0 8px;border-bottom:2px solid #0FA3A3;padding-bottom:4px}
    .muted{color:#5B6B82}.grid{display:flex;gap:10px;margin-top:14px}.box{flex:1;border:1px solid #E3E8EF;border-radius:10px;padding:10px}
    .big{font-size:16px;font-weight:700;margin-top:4px}.in{color:#16A34A}.out{color:#E8584A}
    table{width:100%;border-collapse:collapse}td,th{padding:6px 4px;border-bottom:1px solid #EEF2F7;text-align:left}th{font-size:11px;color:#5B6B82}
    .r{text-align:right}.dot{display:inline-block;width:8px;height:8px;border-radius:2px;margin-right:6px}
  </style></head><body>
    <h1>Laporan Keuangan FinTrack</h1>
    <div class="muted">Periode ${esc(d.label)} · dibandingkan ${esc(d.prevLabel)}<br/>Dibuat ${formatDate(todayJakarta())} ${nowTimeJakarta()} WIB</div>
    <div class="grid">
      <div class="box"><div class="muted">Pemasukan</div><div class="big in">${formatRupiah(d.totals.income)}</div><div class="muted">${change(d.incomeChange)} vs periode sebelumnya</div></div>
      <div class="box"><div class="muted">Pengeluaran</div><div class="big out">${formatRupiah(d.totals.expense)}</div><div class="muted">${change(d.expenseChange)} vs periode sebelumnya</div></div>
      <div class="box"><div class="muted">Arus kas bersih</div><div class="big">${formatRupiah(d.totals.net, { sign: true })}</div><div class="muted">${d.totals.count} transaksi</div></div>
    </div>
    <h2>Arus kas</h2>
    <table><tr><td>Saldo awal periode</td><td class="r">${formatRupiah(d.balanceStart)}</td></tr>
      <tr><td>Uang masuk</td><td class="r in">+${formatRupiah(d.totals.income)}</td></tr>
      <tr><td>Uang keluar</td><td class="r out">−${formatRupiah(d.totals.expense)}</td></tr>
      <tr><td><b>Saldo akhir</b></td><td class="r"><b>${formatRupiah(d.balanceEnd)}</b></td></tr></table>
    <p class="muted">Rata-rata pengeluaran harian ${formatRupiah(d.avgDailyExpense)} · bulanan ${formatRupiah(d.avgMonthlyExpense)} (dari ${d.days} hari berjalan). Transfer antar akun tidak dihitung.</p>
    ${bucketRows ? `<h2>Tren</h2><table><tr><th>Periode</th><th class="r">Masuk</th><th class="r">Keluar</th><th class="r">Bersih</th></tr>${bucketRows}</table>` : ''}
    ${catRows ? `<h2>Pengeluaran per kategori</h2><table><tr><th>Kategori</th><th class="r">Jumlah</th><th class="r">Porsi</th></tr>${catRows}</table>` : ''}
    ${accRows ? `<h2>Pengeluaran per akun</h2><table>${accRows}</table>` : ''}
    ${methodRows ? `<h2>Pengeluaran per metode pembayaran</h2><table>${methodRows}</table>` : ''}
    ${topRows ? `<h2>Pengeluaran terbesar</h2><table><tr><th>Tanggal</th><th>Nama</th><th>Kategori</th><th class="r">Nominal</th></tr>${topRows}</table>` : ''}
    ${insights ? `<h2>Insight</h2><ul>${insights}</ul>` : ''}
  </body></html>`;
}

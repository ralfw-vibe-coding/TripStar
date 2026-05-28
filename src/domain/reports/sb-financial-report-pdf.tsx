import React from "react";
import { Document, Font, Image, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import type { DocumentRecord, Trip, User } from "../model";
import { NOTO_SANS_BOLD, NOTO_SANS_REGULAR } from "./fonts/noto-sans-data";

Font.register({
  family: "NotoSans",
  fonts: [
    { src: NOTO_SANS_REGULAR, fontWeight: "normal" },
    { src: NOTO_SANS_BOLD,    fontWeight: "bold" },
  ],
});

// ── styles ────────────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  page: {
    fontFamily: "NotoSans",
    fontSize: 7.5,
    padding: "14mm 14mm 14mm 14mm",
    color: "#000",
  },

  // page header
  pageTitle: { fontSize: 11, fontWeight: "bold", marginBottom: 2 },
  pageTitleEn: { fontSize: 8, color: "#555", marginBottom: 6 },
  metaRow: { flexDirection: "row", gap: 16, marginBottom: 10, fontSize: 7.5 },
  metaItem: { flexDirection: "row", gap: 3 },
  metaLabel: { fontWeight: "bold" },

  // section titles
  sectionTitle: { fontSize: 8, fontWeight: "bold", marginTop: 10, marginBottom: 3, borderBottom: "0.5pt solid #000", paddingBottom: 2 },
  sectionTitleEn: { fontSize: 6.5, color: "#555" },

  // days multi-column grid
  colContainer: { flexDirection: "row", gap: 5 },
  col: { flex: 1 },
  colHeader: { flexDirection: "row", borderBottom: "0.5pt solid #555", paddingBottom: 1, marginBottom: 1 },
  colHeaderCell: { fontWeight: "bold", fontSize: 6.5 },
  dayRow: { flexDirection: "row", paddingVertical: 0.5 },
  dayRowAlt: { flexDirection: "row", paddingVertical: 0.5, backgroundColor: "#f5f5f5" },

  // shared cell widths within a column
  cellIdx:     { width: "14%", textAlign: "right", paddingRight: 3 },
  cellDate:    { width: "30%", paddingLeft: 2 },
  cellCountry: { width: "20%", paddingLeft: 2 },
  cellAmount:  { width: "36%", textAlign: "right", paddingRight: 2 },

  // days total row
  daysTotal: { flexDirection: "row", justifyContent: "flex-end", marginTop: 3, paddingTop: 2, borderTop: "0.5pt solid #000" },
  daysTotalLabel: { fontWeight: "bold", marginRight: 6 },
  daysTotalValue: { fontWeight: "bold", width: 55, textAlign: "right" },

  // receipts table
  receiptHeader: { flexDirection: "row", borderBottom: "0.5pt solid #555", paddingBottom: 1, marginBottom: 1 },
  receiptHeaderCell: { fontWeight: "bold", fontSize: 6.5 },
  receiptRow: { flexDirection: "row", paddingVertical: 0.5 },
  receiptRowAlt: { flexDirection: "row", paddingVertical: 0.5, backgroundColor: "#f5f5f5" },
  rDate:    { width: "10%", paddingRight: 3 },
  rPurpose: { flex: 1, paddingRight: 3 },
  rAmount:  { width: "14%", textAlign: "right", paddingRight: 3 },
  rCcy:     { width: "7%"  },
  rEur:     { width: "16%", textAlign: "right", paddingRight: 2, color: "#555" },
  subTotal: { flexDirection: "row", justifyContent: "flex-end", marginTop: 2, paddingTop: 2, borderTop: "0.3pt solid #aaa" },
  subTotalLabel: { color: "#555", marginRight: 6 },
  subTotalValue: { width: 55, textAlign: "right", fontWeight: "bold" },

  // grand total box
  grandTotalBox: { marginTop: 10, paddingTop: 5, borderTop: "1pt solid #000" },
  grandTotalRow: { flexDirection: "row", justifyContent: "flex-end", marginBottom: 2 },
  grandTotalLabel: { marginRight: 6 },
  grandTotalValue: { width: 65, textAlign: "right" },
  grandTotalFinalRow: { flexDirection: "row", justifyContent: "flex-end", marginTop: 3, paddingTop: 3, borderTop: "0.5pt solid #000" },
  grandTotalFinalLabel: { fontWeight: "bold", marginRight: 6 },
  grandTotalFinalValue: { fontWeight: "bold", width: 65, textAlign: "right" },
  sigRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 18 },
  sigBlock: { width: "45%" },
  sigLabelBg: { fontWeight: "bold", fontSize: 7 },
  sigLabelEn: { fontSize: 6, color: "#555", marginBottom: 3 },
  sigImage: { height: 30, objectFit: "contain" as const, marginBottom: 2 },
  sigLine: { borderBottom: "0.5pt solid #000", height: 12 },
});

// ── helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function fmtDateFull(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
}

type DayEntry = {
  idx: number;
  date: string;
  countryAbbr: string | null;
  amount: number | null;
};

function buildDays(trip: Trip): DayEntry[] {
  const map = new Map(trip.dailyAllowances.map((a) => [a.date, a]));
  const entries: DayEntry[] = [];
  const end = new Date(trip.endDate);
  let idx = 1;
  const cur = new Date(trip.startDate);
  while (cur <= end) {
    const iso = cur.toISOString().split("T")[0];
    const a = map.get(iso);
    entries.push({ idx: idx++, date: iso, countryAbbr: a?.countryAbbr ?? null, amount: a?.dailyAllowanceEuro ?? null });
    cur.setDate(cur.getDate() + 1);
  }
  return entries;
}

function numCols(count: number): number {
  if (count <= 7)  return 2;
  if (count <= 18) return 3;
  return 4;
}

// ── sub-components ────────────────────────────────────────────────────────────

function DaysGrid({ days }: { days: DayEntry[] }) {
  const n = numCols(days.length);
  const colSize = Math.ceil(days.length / n);
  const columns = Array.from({ length: n }, (_, i) => days.slice(i * colSize, (i + 1) * colSize));

  return (
    <View style={S.colContainer}>
      {columns.map((col, ci) => (
        <View key={ci} style={S.col}>
          <View style={S.colHeader}>
            <Text style={[S.colHeaderCell, S.cellIdx]}>#</Text>
            <Text style={[S.colHeaderCell, S.cellDate]}>Дата</Text>
            <Text style={[S.colHeaderCell, S.cellCountry]}>CC</Text>
            <Text style={[S.colHeaderCell, S.cellAmount]}>€</Text>
          </View>
          {col.map((d, ri) => (
            <View key={d.date} style={ri % 2 === 0 ? S.dayRow : S.dayRowAlt}>
              <Text style={S.cellIdx}>{d.idx}</Text>
              <Text style={S.cellDate}>{fmtDate(d.date)}</Text>
              <Text style={S.cellCountry}>{d.countryAbbr ?? "—"}</Text>
              <Text style={S.cellAmount}>{d.amount !== null ? fmt(d.amount) : "—"}</Text>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

function receiptEurValue(r: DocumentRecord): number {
  if (!r.receiptCurrency || r.receiptCurrency === "EUR") return r.receiptAmount ?? 0;
  return r.receiptAmountEur ?? 0;
}

function ReceiptsTable({ receipts, title, titleEn }: { receipts: DocumentRecord[]; title: string; titleEn: string }) {
  if (receipts.length === 0) return null;

  const hasNonEur = receipts.some((r) => r.receiptCurrency && r.receiptCurrency !== "EUR");
  const eurTotal  = receipts
    .filter((r) => r.receiptAmount !== null || r.receiptAmountEur !== null)
    .reduce((s, r) => s + receiptEurValue(r), 0);

  const nonEur = receipts.filter((r) => r.receiptCurrency && r.receiptCurrency !== "EUR" && r.receiptAmount !== null);
  // group non-EUR by currency (original amounts, for reference subtotals)
  const byCcy = new Map<string, number>();
  for (const r of nonEur) {
    const ccy = r.receiptCurrency!;
    byCcy.set(ccy, (byCcy.get(ccy) ?? 0) + r.receiptAmount!);
  }

  return (
    <>
      <View style={S.sectionTitle}>
        <Text>{title}</Text>
        <Text style={S.sectionTitleEn}>{titleEn}</Text>
      </View>
      <View style={S.receiptHeader}>
        <Text style={[S.receiptHeaderCell, S.rDate]}>Дата</Text>
        <Text style={[S.receiptHeaderCell, S.rPurpose]}>Описание / Description</Text>
        <Text style={[S.receiptHeaderCell, S.rAmount]}>Сума / Amount</Text>
        <Text style={[S.receiptHeaderCell, S.rCcy]}>CCY</Text>
        {hasNonEur && <Text style={[S.receiptHeaderCell, S.rEur]}>≈ EUR</Text>}
      </View>
      {receipts.map((r, i) => {
        const isNonEur = r.receiptCurrency && r.receiptCurrency !== "EUR";
        return (
          <View key={r.id} style={i % 2 === 0 ? S.receiptRow : S.receiptRowAlt}>
            <Text style={S.rDate}>{fmtDate(r.receiptDate)}</Text>
            <Text style={S.rPurpose}>{r.receiptPurpose ?? r.originalFileName ?? "—"}</Text>
            <Text style={S.rAmount}>{r.receiptAmount !== null ? fmt(r.receiptAmount) : "—"}</Text>
            <Text style={S.rCcy}>{r.receiptCurrency ?? "EUR"}</Text>
            {hasNonEur && (
              <Text style={S.rEur}>
                {isNonEur && r.receiptAmountEur !== null ? `≈ ${fmt(r.receiptAmountEur)} €` : ""}
              </Text>
            )}
          </View>
        );
      })}
      <View style={S.subTotal}>
        <Text style={S.subTotalLabel}>EUR сума / EUR total:</Text>
        <Text style={S.subTotalValue}>{fmt(eurTotal)} €</Text>
      </View>
      {[...byCcy.entries()].map(([ccy, total]) => (
        <View key={ccy} style={S.subTotal}>
          <Text style={S.subTotalLabel}>{ccy} сума / {ccy} total:</Text>
          <Text style={S.subTotalValue}>{fmt(total)} {ccy}</Text>
        </View>
      ))}
    </>
  );
}

// ── main component ────────────────────────────────────────────────────────────

export function SbFinancialReportDocument({
  trip,
  user,
  receipts,
}: {
  trip: Trip;
  user: User;
  receipts: DocumentRecord[];
}) {
  const days = buildDays(trip);
  const dailyTotal = trip.dailyAllowances.reduce((s, a) => s + a.dailyAllowanceEuro, 0);

  const reimbursable = receipts.filter((r) => r.receiptType === "reimbursable");
  const reportOnly   = receipts.filter((r) => r.receiptType !== "reimbursable");

  const reimbursableEur = reimbursable
    .filter((r) => r.receiptAmount !== null || r.receiptAmountEur !== null)
    .reduce((s, r) => s + receiptEurValue(r), 0);

  const grandTotal = dailyTotal + reimbursableEur;

  return (
    <Document>
      <Page size="A4" style={S.page}>

        {/* Page header */}
        <Text style={S.pageTitle}>ФИНАНСОВ ОТЧЕТ</Text>
        <Text style={S.pageTitleEn}>FINANCIAL REPORT</Text>

        <View style={S.metaRow}>
          <View style={S.metaItem}>
            <Text style={S.metaLabel}>№</Text>
            <Text>{trip.tripNumber}</Text>
          </View>
          <View style={S.metaItem}>
            <Text style={S.metaLabel}>Период / Period:</Text>
            <Text>{fmtDateFull(trip.startDate)} – {fmtDateFull(trip.endDate)}</Text>
          </View>
          <View style={S.metaItem}>
            <Text style={S.metaLabel}>Фирма / Company:</Text>
            <Text>{user.companyName ?? "—"}</Text>
          </View>
          <View style={S.metaItem}>
            <Text style={S.metaLabel}>Командирован / Employee:</Text>
            <Text>{user.name ?? user.shortCode}</Text>
          </View>
        </View>

        {/* Daily allowances */}
        <View style={S.sectionTitle}>
          <Text>ДНЕВНИ КОМАНДИРОВЪЧНИ</Text>
          <Text style={S.sectionTitleEn}>DAILY ALLOWANCES</Text>
        </View>
        <DaysGrid days={days} />
        <View style={S.daysTotal}>
          <Text style={S.daysTotalLabel}>Общо дневни / Daily total:</Text>
          <Text style={S.daysTotalValue}>{fmt(dailyTotal)} €</Text>
        </View>

        {/* Reimbursable receipts */}
        <ReceiptsTable
          receipts={reimbursable}
          title="РАЗХОДИ ЗА ВЪЗСТАНОВЯВАНЕ"
          titleEn="REIMBURSABLE EXPENSES"
        />

        {/* Report-only receipts */}
        <ReceiptsTable
          receipts={reportOnly}
          title="ЗА СПРАВКА (НЕВЪЗСТАНОВЯЕМИ)"
          titleEn="FOR REFERENCE (NOT REIMBURSABLE)"
        />

        {/* Grand total */}
        <View style={S.grandTotalBox}>
          <View style={S.grandTotalRow}>
            <Text style={S.grandTotalLabel}>Дневни / Daily allowances:</Text>
            <Text style={S.grandTotalValue}>{fmt(dailyTotal)} €</Text>
          </View>
          <View style={S.grandTotalRow}>
            <Text style={S.grandTotalLabel}>+ Разходи EUR / Reimbursable EUR:</Text>
            <Text style={S.grandTotalValue}>{fmt(reimbursableEur)} €</Text>
          </View>
          <View style={S.grandTotalFinalRow}>
            <Text style={S.grandTotalFinalLabel}>= За възстановяване / Total reimbursement:</Text>
            <Text style={S.grandTotalFinalValue}>{fmt(grandTotal)} €</Text>
          </View>
        </View>

        {/* Signatures */}
        <View style={S.sigRow}>
          <View style={S.sigBlock}>
            <Text style={S.sigLabelBg}>Управител</Text>
            <Text style={S.sigLabelEn}>Director / Manager</Text>
            {user.signatureManager ? <Image src={user.signatureManager} style={S.sigImage} /> : null}
            <View style={S.sigLine} />
          </View>
          <View style={S.sigBlock}>
            <Text style={S.sigLabelBg}>Командирован</Text>
            <Text style={S.sigLabelEn}>Employee</Text>
            {user.signatureEmployee ? <Image src={user.signatureEmployee} style={S.sigImage} /> : null}
            <View style={S.sigLine} />
          </View>
        </View>

      </Page>
    </Document>
  );
}

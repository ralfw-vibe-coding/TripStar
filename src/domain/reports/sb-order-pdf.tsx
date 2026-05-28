import React from "react";
import { Document, Font, Image, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import type { Trip, User } from "../model";
import { NOTO_SANS_BOLD, NOTO_SANS_REGULAR } from "./fonts/noto-sans-data";

// Noto Sans with Latin + Cyrillic support, embedded as data URIs
Font.register({
  family: "NotoSans",
  fonts: [
    { src: NOTO_SANS_REGULAR, fontWeight: "normal" },
    { src: NOTO_SANS_BOLD,    fontWeight: "bold" },
  ],
});

const styles = StyleSheet.create({
  page: {
    fontFamily: "NotoSans",
    fontSize: 9,
    padding: "20mm 20mm 20mm 20mm",
    color: "#000",
  },

  // ── Company header ────────────────────────────────────────────────
  companyHeader: {
    marginBottom: 12,
    borderBottom: "1pt solid #000",
    paddingBottom: 4,
  },
  companyLabelBg: { fontSize: 8, color: "#555" },
  companyLabelEn: { fontSize: 10, fontWeight: "bold" },
  companyValue:   { fontSize: 10, fontWeight: "bold" },

  // ── ORDER title row ───────────────────────────────────────────────
  titleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  orderTitleBox: { flexDirection: "column" },
  orderTitleBg: { fontSize: 14, fontWeight: "bold", letterSpacing: 1 },
  orderTitleEn: { fontSize: 11, color: "#555",      letterSpacing: 1 },
  orderMeta: { flexDirection: "row", gap: 16 },
  metaItem:  { flexDirection: "row", gap: 3 },
  metaLabelBg: { fontSize: 8, color: "#555" },
  metaLabelEn: { fontSize: 9, fontWeight: "bold" },
  metaValue:   { fontSize: 9 },

  // ── Grounds (legal boilerplate intro) ────────────────────────────
  groundsBox: { marginBottom: 10 },
  groundsBg: { fontSize: 7, color: "#555" },
  groundsEn: { fontSize: 7, color: "#555" },

  // ── SEND title ────────────────────────────────────────────────────
  sendTitleBg: { fontSize: 10, fontWeight: "bold", letterSpacing: 1 },
  sendTitleEn: { fontSize: 9,  color: "#555",      letterSpacing: 0.5, marginBottom: 10 },

  // ── Field rows ────────────────────────────────────────────────────
  fieldRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 7,
    minHeight: 22,
  },
  fieldLabelBox: {
    width: "36%",
    flexDirection: "column",
    justifyContent: "center",
    paddingRight: 6,
  },
  fieldLabelBg: { fontSize: 9, fontWeight: "bold" },
  fieldLabelEn: { fontSize: 7.5, color: "#666" },
  fieldValue: {
    flex: 1,
    borderBottom: "0.5pt solid #666",
    paddingBottom: 2,
    paddingLeft: 3,
    fontSize: 9,
  },

  // ── Footer boilerplate ────────────────────────────────────────────
  boilerplateBox: { marginTop: 10, marginBottom: 6 },
  boilerplateBg:  { fontSize: 7.5, color: "#333", lineHeight: 1.4 },
  boilerplateEn:  { fontSize: 7, color: "#555", lineHeight: 1.4, marginTop: 2 },

  // ── Signatures ────────────────────────────────────────────────────
  signatureRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 24,
  },
  signatureBlock: { width: "45%" },
  sigLabelBg: { fontWeight: "bold", fontSize: 8 },
  sigLabelEn: { fontSize: 7, color: "#555", marginBottom: 4 },
  signatureImage: { height: 36, objectFit: "contain" as const, marginBottom: 2 },
  signatureLine: { borderBottom: "0.5pt solid #000", height: 14 },
});

// ── helpers ──────────────────────────────────────────────────────────

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
}

function daysBetween(start: string, end: string): number {
  const a = new Date(start);
  const b = new Date(end);
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24)) + 1;
}

/** Bilingual label box (Bulgarian on top, English below) + value alongside */
function Field({ bg, en, value }: { bg: string; en: string; value: string }) {
  return (
    <View style={styles.fieldRow}>
      <View style={styles.fieldLabelBox}>
        <Text style={styles.fieldLabelBg}>{bg}</Text>
        <Text style={styles.fieldLabelEn}>{en}</Text>
      </View>
      <Text style={styles.fieldValue}>{value}</Text>
    </View>
  );
}

// ── component ─────────────────────────────────────────────────────────

export function SbOrderDocument({ trip, user }: { trip: Trip; user: User }) {
  const period = `${fmtDate(trip.startDate)} – ${fmtDate(trip.endDate)}`;
  const days = trip.startDate && trip.endDate ? String(daysBetween(trip.startDate, trip.endDate)) : "—";

  return (
    <Document>
      <Page size="A4" style={styles.page}>

        {/* Company header */}
        <View style={styles.companyHeader}>
          <Text style={styles.companyLabelBg}>Фирма</Text>
          <Text style={styles.companyLabelEn}>Company: <Text style={styles.companyValue}>{user.companyName ?? "—"}</Text></Text>
        </View>

        {/* ORDER title + meta */}
        <View style={styles.titleRow}>
          <View style={styles.orderTitleBox}>
            <Text style={styles.orderTitleBg}>З А П О В Е Д</Text>
            <Text style={styles.orderTitleEn}>O R D E R</Text>
          </View>
          <View style={styles.orderMeta}>
            <View style={styles.metaItem}>
              <View>
                <Text style={styles.metaLabelBg}>№</Text>
                <Text style={styles.metaLabelEn}>No.</Text>
              </View>
              <Text style={styles.metaValue}> {trip.tripNumber}</Text>
            </View>
            <View style={styles.metaItem}>
              <View>
                <Text style={styles.metaLabelBg}>дата</Text>
                <Text style={styles.metaLabelEn}>date</Text>
              </View>
              <Text style={styles.metaValue}> {fmtDate(trip.orderedAt)}</Text>
            </View>
          </View>
        </View>

        {/* Legal grounds */}
        <View style={styles.groundsBox}>
          <Text style={styles.groundsBg}>
            На основание на Наредбата за служебни командировки и специализации в чужбина
          </Text>
          <Text style={styles.groundsEn}>
            On the grounds of the Ordinance for business trips and specializations abroad
          </Text>
        </View>

        {/* SEND title */}
        <Text style={styles.sendTitleBg}>К О М А Н Д И Р О В А М:</Text>
        <Text style={styles.sendTitleEn}>I SEND TO A BUSINESS TRIP:</Text>

        {/* Fields */}
        <Field bg="Име"          en="Name"           value={user.name ?? user.shortCode ?? "—"} />
        <Field bg="Длъжност"     en="Job position"   value={user.jobPosition ?? "—"} />
        <Field bg="Дестинация"   en="Destination"    value={trip.places ?? "—"} />
        <Field bg="Задача"       en="Tasks"          value={trip.purpose ?? "—"} />
        <Field bg="Период"       en="Period"         value={period} />
        <Field bg="Общо дни"     en="Days total"     value={days} />
        <Field bg="Транспорт"    en="Transportation" value={trip.meansOfTransportation ?? "—"} />

        {/* Boilerplate */}
        <View style={styles.boilerplateBox}>
          <Text style={styles.boilerplateBg}>
            Командировката е с право на пътни, дневни и квартирни пари, паспортни, визови и
            други такси и разходи за служебен багаж.
          </Text>
          <Text style={styles.boilerplateEn}>
            The business trip is with right to allowances for travelling, per diem and accommodation,
            passport, visa and other expenses for business luggage.
          </Text>
        </View>
        <View style={styles.boilerplateBox}>
          <Text style={styles.boilerplateBg}>
            Задължавам командированият да представи в 10-дневен срок от завръщането си
            доклад за дейността и финансов отчет.
          </Text>
          <Text style={styles.boilerplateEn}>
            I impose that the traveller presents within 10 days of return a report of
            completed tasks and a financial report.
          </Text>
        </View>

        {/* Signatures */}
        <View style={styles.signatureRow}>
          <View style={styles.signatureBlock}>
            <Text style={styles.sigLabelBg}>Управител</Text>
            <Text style={styles.sigLabelEn}>Director / Manager</Text>
            {user.signatureManager
              ? <Image src={user.signatureManager} style={styles.signatureImage} />
              : null}
            <View style={styles.signatureLine} />
          </View>
          <View style={styles.signatureBlock}>
            <Text style={styles.sigLabelBg}>Командирован</Text>
            <Text style={styles.sigLabelEn}>Employee</Text>
            {user.signatureEmployee
              ? <Image src={user.signatureEmployee} style={styles.signatureImage} />
              : null}
            <View style={styles.signatureLine} />
          </View>
        </View>

      </Page>
    </Document>
  );
}

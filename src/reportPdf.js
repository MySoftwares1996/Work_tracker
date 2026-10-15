/**
 * The report as a PDF to send on (WhatsApp, mail, Drive). On the phone it is made with expo-print and handed to the
 * share sheet; in a browser the print window opens, where "Save as PDF" is one of the printers.
 */
import { Platform } from 'react-native';
import * as Sharing from 'expo-sharing';
import { reportHtml } from './workingDashboardReport';

/** File name for the PDF: "Daily Activity Report 07 Oct 2026.pdf" style, without characters a share target rejects. */
export const pdfFileName = (title) => `${String(title || 'Report').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim()}.pdf`;

/** True once the PDF is shared (phone) or the print window is open (web). */
export async function shareReportPdf(title, text) {
  const html = reportHtml(title, text);
  if (Platform.OS === 'web') {
    const w = globalThis.open ? globalThis.open('', '_blank') : null;
    if (!w) return false;                 // a pop-up blocker said no
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => { try { w.print(); } catch { /* the window was closed */ } }, 300);
    return true;
  }
  const Print = await import('expo-print');
  const { uri } = await Print.printToFileAsync({ html });
  if (!(await Sharing.isAvailableAsync())) return false;
  await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: pdfFileName(title) });
  return true;
}

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export const generateOfficialPDF = (scheduleData: any[]) => {
  const doc = new jsPDF('p', 'mm', 'a4');

  // --- KOP SURAT ---
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("PEMERINTAH DAERAH PROVINSI JAWA BARAT", 105, 15, { align: "center" });
  doc.text("DINAS PENDIDIKAN", 105, 21, { align: "center" });
  doc.setFontSize(16);
  doc.text("SMA NEGERI 2 JONGGOL", 105, 28, { align: "center" });
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text("Jl. Raya Jonggol - Sukamakmur, Kabupaten Bogor, Jawa Barat 16830", 105, 34, { align: "center" });
  
  doc.setLineWidth(1);
  doc.line(15, 38, 195, 38);
  doc.setLineWidth(0.3);
  doc.line(15, 39.5, 195, 39.5);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("JADWAL TUGAS SASAMU & JAMPARIKU (SESI PAGI & SIANG)", 105, 50, { align: "center" });

  // --- TABEL ---
  const tableBody: any[] = [];
  scheduleData.forEach((hari) => {
    const dateObj = new Date(hari.tanggal);
    const formattedDate = new Intl.DateTimeFormat('id-ID', { weekday: 'long', day: 'numeric', month: 'long' }).format(dateObj);
    
    hari.sesi.forEach((sesi: any) => {
      sesi.tugas.forEach((t: any) => {
        tableBody.push([
          formattedDate,
          sesi.nama_sesi,
          t.program,
          t.petugas.join(", ")
        ]);
      });
    });
  });

  autoTable(doc, {
    startY: 58,
    head: [['Tanggal', 'Sesi', 'Program', 'Nama Petugas']],
    body: tableBody,
    theme: 'grid',
    headStyles: { fillColor: [44, 62, 80], halign: 'center' },
    styles: { fontSize: 8 },
  });

  doc.save("Jadwal_Resmi_SMAN2_TwoSessions.pdf");
};
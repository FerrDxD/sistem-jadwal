import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export const generateOfficialPDF = (scheduleData: any[]) => {
  // Membuat dokumen A4 posisi Potret (Portrait)
  const doc = new jsPDF('p', 'mm', 'a4');

  // --- KOP SURAT ---
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("PEMERINTAH DAERAH PROVINSI JAWA BARAT", 105, 15, { align: "center" });
  doc.text("DINAS PENDIDIKAN", 105, 21, { align: "center" });
  
  doc.setFontSize(16);
  doc.text("SMA NEGERI 2 JONGGOL", 105, 28, { align: "center" });
  
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text("Jl. Raya Jonggol - Sukamakmur, Kabupaten Bogor, Jawa Barat 16830", 105, 34, { align: "center" });
  
  // Garis Pembatas Kop Surat (Tebal dan Tipis)
  doc.setLineWidth(1);
  doc.line(15, 38, 195, 38);
  doc.setLineWidth(0.3);
  doc.line(15, 39.5, 195, 39.5);

  // --- JUDUL DOKUMEN ---
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("JADWAL TUGAS SASAMU & JAMPARIKU", 105, 50, { align: "center" });
  doc.setLineWidth(0.3);
  doc.line(65, 51.5, 145, 51.5); // Garis bawah judul

  // --- MERAKIT DATA TABEL ---
  const tableBody: any[] = [];
  let rowIndex = 1;

  scheduleData.forEach((hari) => {
    // Format Tanggal
    const dateObj = new Date(hari.tanggal);
    const formatter = new Intl.DateTimeFormat('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const formattedDate = formatter.format(dateObj);
    
    hari.tugas.forEach((tugas: any) => {
      tableBody.push([
        rowIndex++,
        formattedDate,
        tugas.program,
        tugas.petugas.length > 0 ? tugas.petugas.join("\n") : "-" // Baris baru jika orangnya banyak
      ]);
    });
  });

  // --- MENGGAMBAR TABEL ---
  autoTable(doc, {
    startY: 58,
    head: [['No', 'Hari, Tanggal', 'Program', 'Nama Petugas']],
    body: tableBody,
    theme: 'grid',
    headStyles: { fillColor: [44, 62, 80], halign: 'center', textColor: 255 },
    columnStyles: {
      0: { halign: 'center', cellWidth: 15 }, // Kolom No
      1: { cellWidth: 50 },                   // Kolom Tanggal
      2: { cellWidth: 40 },                   // Kolom Program
      3: { cellWidth: 'auto' }                // Kolom Petugas
    },
    styles: { fontSize: 10, cellPadding: 3, valign: 'middle' },
  });

  // --- KOLOM TANDA TANGAN ---
  // @ts-ignore - Mengambil posisi Y terakhir dari tabel agar TTD dinamis menyesuaikan panjang tabel
  const finalY = doc.lastAutoTable.finalY || 60; 
  const signatureY = finalY + 20;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  
  // Tanggal Pembuatan Dokumen (Otomatis hari ini)
  const today = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());
  doc.text(`Jonggol, ${today}`, 155, signatureY - 6, { align: "center" });

  doc.text("Mengetahui,", 55, signatureY, { align: "center" });
  doc.text("Kepala SMAN 2 Jonggol", 55, signatureY + 6, { align: "center" });
  
  doc.text("Pembina OSIS / MPK", 155, signatureY + 6, { align: "center" });

  // Nama dan NIP
  doc.setFont("helvetica", "bold");
  doc.text("( .................................................... )", 55, signatureY + 30, { align: "center" });
  doc.text("NIP.", 28, signatureY + 36);

  doc.text("( .................................................... )", 155, signatureY + 30, { align: "center" });
  doc.text("NIP.", 128, signatureY + 36);

  // --- SIMPAN FILE ---
  doc.save("Jadwal_SASAMU_JAMPARIKU_SMAN2.pdf");
};
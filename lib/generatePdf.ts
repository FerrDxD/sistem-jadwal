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
  doc.text("JADWAL TUGAS SASAMU & JAMPARIKU", 105, 50, { align: "center" });

  // --- TABEL ---
  const tableBody: any[] = [];
  let no = 1; // Counter untuk kolom Nomor

  scheduleData.forEach((hari) => {
    const dateObj = new Date(hari.tanggal);
    // Format tanggal lebih lengkap (misal: Senin, 11 Mei 2026)
    const formattedDate = new Intl.DateTimeFormat('id-ID', { 
        weekday: 'long', 
        day: 'numeric', 
        month: 'long',
        year: 'numeric' 
    }).format(dateObj);
    
    hari.sesi.forEach((sesi: any) => {
      sesi.tugas.forEach((t: any) => {
        // Susun nama menjadi baris ke bawah dengan nomor (1. Nama A \n 2. Nama B)
        const daftarNama = t.petugas.map((nama: string, idx: number) => `${idx + 1}. ${nama}`).join('\n');

        tableBody.push([
          no++,               // 1. No
          formattedDate,      // 2. Hari, Tanggal
          t.program,          // 3. Program
          sesi.nama_sesi,     // 4. Sesi
          daftarNama          // 5. Nama Petugas (Format List)
        ]);
      });
    });
  });

  autoTable(doc, {
    startY: 58,
    head: [['No', 'Hari, Tanggal', 'Program', 'Sesi', 'Nama Petugas']],
    body: tableBody,
    theme: 'grid',
    headStyles: { 
        fillColor: [44, 62, 80], 
        textColor: [255, 255, 255],
        halign: 'center',
        valign: 'middle',
        fontSize: 10
    },
    bodyStyles: { 
        fontSize: 9,
        valign: 'middle',
        cellPadding: 4 // Bikin sel lebih lega, tidak dempet ke garis
    },
    columnStyles: {
        0: { halign: 'center', cellWidth: 10 },  // Kolom No (Kecil saja)
        1: { cellWidth: 35 },                    // Kolom Hari, Tanggal
        2: { halign: 'center', cellWidth: 25 },  // Kolom Program
        3: { halign: 'center', cellWidth: 20 },  // Kolom Sesi
        4: { cellWidth: 'auto' }                 // Kolom Nama (Sisa ruang, lebar)
    },
    // Pengaturan Multi-Halaman:
    rowPageBreak: 'avoid', // Mencegah 1 kotak terpotong sebagian di halaman 1 dan sebagian di halaman 2
    margin: { top: 20, bottom: 20, left: 15, right: 15 }, // Margin aman untuk lembar ke-2 dst
  });

  doc.save("Jadwal_SASAMU DAN JAMPARIKU_SMANDJO.pdf");
};
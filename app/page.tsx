"use client";

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { generateOfficialPDF } from '@/lib/generatePdf';

export default function Dashboard() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [pin, setPin] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isFetching, setIsFetching] = useState(true);
  const [members, setMembers] = useState<any[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateResult, setGenerateResult] = useState<any>(null);
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + ((1 + 7 - d.getDay()) % 7 || 7)); 
    return d.toISOString().split('T')[0];
  });

  useEffect(() => {
    const authStatus = localStorage.getItem('sasamujampariku_auth');
    if (authStatus === 'true') setIsAuthenticated(true);
    setIsCheckingAuth(false);
  }, []);

  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  useEffect(() => {
    if (!isAuthenticated) return;
    const fetchMembers = async () => {
      const { data } = await supabase.from('members').select('*').order('class_grade', { ascending: true });
      if (data) setMembers(data);
      setIsFetching(false);
    };
    fetchMembers();
  }, [isAuthenticated]);

  const handleLogin = (e: any) => {
    e.preventDefault();
    if (pin === "OSIS26") {
      setIsAuthenticated(true);
      localStorage.setItem('sasamujampariku_auth', 'true');
    } else {
      setLoginError('PIN Salah!');
    }
  };

  const handleGenerate = async () => {
    setIsGenerating(true);
    const res = await fetch('/api/generate-schedule', {
      method: 'POST',
      body: JSON.stringify({ startDate, days: 5 })
    });
    const result = await res.json();
    setGenerateResult(result);
    setIsGenerating(false);
  };

  if (isCheckingAuth) return null;
  if (!isAuthenticated) {
    return (
      <main className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <form onSubmit={handleLogin} className="bg-white p-8 rounded-3xl w-full max-w-sm">
          <h1 className="text-xl font-bold mb-4 text-center text-slate-800">Login Admin OSIS</h1>
          <input type="password" value={pin} onChange={(e) => setPin(e.target.value)} className="w-full p-3 border rounded-xl mb-4 text-center text-2xl tracking-widest text-slate-800" placeholder="PIN" />
          <button className="w-full bg-indigo-600 text-white p-3 rounded-xl font-bold">Buka Kunci</button>
          {loginError && <p className="text-red-500 text-center mt-2">{loginError}</p>}
        </form>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#F8FAFC] p-4 md:p-12">
      <div className="max-w-6xl mx-auto space-y-8">
        <header className="flex flex-col md:flex-row justify-between items-center bg-white p-6 rounded-3xl shadow-sm gap-4">
          <div>
            <h1 className="text-3xl font-black text-slate-900">Sistem Dua Sesi</h1>
            <p className="text-slate-500">Pagi (Kelas XI) & Siang (Kelas X)</p>
          </div>
          <div className="flex gap-2">
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="p-3 rounded-xl border" />
            <button onClick={handleGenerate} className="bg-indigo-600 text-white px-6 py-3 rounded-xl font-bold">{isGenerating ? '...' : 'Generate'}</button>
          </div>
        </header>

        {generateResult && (
          <div className="space-y-8 animate-in fade-in duration-500">
            <button onClick={() => generateOfficialPDF(generateResult.schedule)} className="w-full bg-emerald-500 text-white p-4 rounded-2xl font-bold shadow-lg">🖨️ Cetak Jadwal Dua Sesi</button>
            <div className="grid grid-cols-1 gap-8">
              {generateResult.schedule.map((hari: any, idx: number) => (
                <div key={idx} className="bg-white p-6 rounded-3xl border">
                  <h2 className="text-xl font-bold border-b pb-4 mb-6">{new Date(hari.tanggal).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' })}</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {hari.sesi.map((s: any, sIdx: number) => (
                      <div key={sIdx} className="space-y-4">
                        <span className={`px-4 py-1 rounded-full text-xs font-bold uppercase ${s.nama_sesi === 'Pagi' ? 'bg-orange-100 text-orange-600' : 'bg-blue-100 text-blue-600'}`}>{s.nama_sesi}</span>
                        {s.tugas.map((t: any, tIdx: number) => (
                          <div key={tIdx} className="p-4 bg-slate-50 rounded-2xl">
                            <p className="text-xs font-bold text-slate-400 mb-2">{t.program}</p>
                            <div className="flex flex-wrap gap-2">
                              {t.petugas.map((nama: string, nIdx: number) => (
                                <span key={nIdx} className="bg-white px-3 py-1 rounded-lg text-sm border shadow-sm">{nama}</span>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
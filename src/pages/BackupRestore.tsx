import React, { useState, useRef } from 'react';
import { DatabaseBackup, Upload, Download, AlertTriangle, CheckCircle2, RefreshCw } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export default function BackupRestore() {
  const { fetchApi } = useAuth();
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error' | 'info', message: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleBackup = async () => {
    setIsBackingUp(true);
    setStatus({ type: 'info', message: 'Đang tạo bản sao lưu...' });
    
    try {
      const res = await fetchApi('/api/backup');
      if (!res.ok) throw new Error('Không thể tạo bản sao lưu');
      
      const data = await res.json();
      
      // Create and download file
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `wealthos_backup_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      setStatus({ type: 'success', message: 'Đã tải xuống bản sao lưu thành công' });
    } catch (err: any) {
      setStatus({ type: 'error', message: err.message || 'Có lỗi xảy ra khi sao lưu' });
    } finally {
      setIsBackingUp(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const content = event.target?.result as string;
        const data = JSON.parse(content);
        
        // Basic validation
        if (!data.version || !data.data) {
          throw new Error('Định dạng file sao lưu không hợp lệ');
        }

        if (confirm('CẢNH BÁO: Việc phục hồi sẽ xóa toàn bộ dữ liệu hiện tại và thay thế bằng dữ liệu từ bản sao lưu. Bạn có chắc chắn muốn tiếp tục?')) {
          await performRestore(data);
        }
      } catch (err: any) {
        setStatus({ type: 'error', message: err.message || 'File không hợp lệ' });
      }
      
      // Reset input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };

  const performRestore = async (backupData: any) => {
    setIsRestoring(true);
    setStatus({ type: 'info', message: 'Đang phục hồi dữ liệu...' });
    
    try {
      const res = await fetchApi('/api/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: backupData.data })
      });
      
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Phục hồi thất bại');
      
      setStatus({ type: 'success', message: 'Phục hồi dữ liệu thành công. Vui lòng tải lại trang.' });
      
      // Optional: Auto reload after a few seconds
      setTimeout(() => {
        window.location.reload();
      }, 3000);
      
    } catch (err: any) {
      setStatus({ type: 'error', message: err.message || 'Có lỗi xảy ra khi phục hồi' });
    } finally {
      setIsRestoring(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Sao lưu & Phục hồi</h1>
        <p className="text-slate-500 text-sm mt-1">Quản lý an toàn dữ liệu hệ thống của bạn</p>
      </div>

      {status && (
        <div className={`p-4 rounded-2xl text-sm flex items-start gap-3 shadow-sm ${
          status.type === 'success' ? 'bg-emerald-50 border border-emerald-200 text-emerald-700' :
          status.type === 'error' ? 'bg-rose-50 border border-rose-200 text-rose-700' :
          'bg-slate-50 border border-slate-200 text-slate-700'
        }`}>
          {status.type === 'success' ? <CheckCircle2 className="w-5 h-5 shrink-0" /> :
           status.type === 'error' ? <AlertTriangle className="w-5 h-5 shrink-0" /> :
           <RefreshCw className="w-5 h-5 shrink-0 animate-spin" />}
          <div className="pt-0.5">{status.message}</div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Backup Section */}
        <div className="bg-white border border-slate-200 rounded-3xl p-8 shadow-sm flex flex-col hover:shadow-md transition-shadow">
          <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center mb-6 border border-emerald-100">
            <Download className="w-7 h-7 text-emerald-600" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-3">Sao lưu dữ liệu</h2>
          <p className="text-slate-500 text-sm mb-8 flex-1 leading-relaxed">
            Tải xuống toàn bộ dữ liệu hiện tại của hệ thống bao gồm: danh mục tài sản, giao dịch, dòng tiền và thông tin người dùng dưới dạng file JSON.
          </p>
          <button
            onClick={handleBackup}
            disabled={isBackingUp || isRestoring}
            className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-3.5 rounded-2xl text-sm font-semibold transition-all shadow-sm hover:shadow-md active:scale-95"
          >
            {isBackingUp ? (
              <><RefreshCw className="w-4 h-4 animate-spin" /> Đang tạo bản sao lưu...</>
            ) : (
              <><DatabaseBackup className="w-4 h-4" /> Tạo bản sao lưu</>
            )}
          </button>
        </div>

        {/* Restore Section */}
        <div className="bg-white border border-slate-200 rounded-3xl p-8 shadow-sm flex flex-col hover:shadow-md transition-shadow">
          <div className="w-14 h-14 rounded-2xl bg-slate-50 flex items-center justify-center mb-6 border border-slate-100">
            <Upload className="w-7 h-7 text-slate-600" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-3">Phục hồi dữ liệu</h2>
          <p className="text-slate-500 text-sm mb-8 flex-1 leading-relaxed">
            Khôi phục hệ thống từ một file sao lưu JSON. <span className="text-rose-600 font-semibold">Lưu ý: Hành động này sẽ ghi đè và xóa toàn bộ dữ liệu hiện tại.</span>
          </p>
          
          <input
            type="file"
            accept=".json"
            className="hidden"
            ref={fileInputRef}
            onChange={handleFileSelect}
          />
          
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isBackingUp || isRestoring}
            className="w-full flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-3.5 rounded-2xl text-sm font-semibold transition-all shadow-sm hover:shadow-md active:scale-95"
          >
            {isRestoring ? (
              <><RefreshCw className="w-4 h-4 animate-spin" /> Đang phục hồi...</>
            ) : (
              <><Upload className="w-4 h-4" /> Chọn file sao lưu</>
            )}
          </button>
        </div>
      </div>
      
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 flex gap-4 shadow-sm">
        <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center shrink-0 border border-amber-200">
          <AlertTriangle className="w-5 h-5 text-amber-600" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-amber-800 mb-1.5 uppercase tracking-wider">Lưu ý quan trọng</h3>
          <ul className="text-xs text-amber-700 space-y-1.5 list-disc list-inside leading-relaxed">
            <li>Nên tạo bản sao lưu định kỳ để tránh mất mát dữ liệu.</li>
            <li>Giữ file sao lưu ở nơi an toàn, không chia sẻ cho người không có thẩm quyền.</li>
            <li>Quá trình phục hồi không thể hoàn tác. Hãy chắc chắn bạn đã chọn đúng file.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

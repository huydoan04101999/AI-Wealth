import React, { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Users, Briefcase, Settings, TrendingUp, DollarSign, Globe, UserCog, DatabaseBackup, Calculator, LogOut, Menu, X, Bitcoin } from 'lucide-react';
import { cn } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';

export default function Layout() {
  const { userData, logout } = useAuth();
  const navigate = useNavigate();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  
  const navItems = [
    { name: 'Tổng quan', path: '/', icon: LayoutDashboard },
    { name: 'Phòng tác chiến', path: '/war-room', icon: Users },
    { name: 'Danh mục', path: '/portfolio', icon: Briefcase },
    { name: 'Crypto AI', path: '/crypto', icon: Bitcoin },
    { name: 'Dòng tiền', path: '/cashflow', icon: DollarSign },
  ];

  const adminItems = [
    { name: 'Người dùng', path: '/users', icon: UserCog },
    { name: 'Sao lưu & Phục hồi', path: '/backup', icon: DatabaseBackup },
    { name: 'Cài đặt', path: '/settings', icon: Settings },
  ];

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const closeMobileMenu = () => setIsMobileMenuOpen(false);

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 font-sans overflow-hidden">
      {/* Mobile Menu Overlay */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/50 z-40 lg:hidden backdrop-blur-sm"
          onClick={closeMobileMenu}
        />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "fixed lg:static inset-y-0 left-0 z-50 w-64 border-r border-slate-200 bg-white flex flex-col transition-transform duration-300 ease-in-out lg:translate-x-0",
        isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="p-6 flex items-center justify-between border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-200">
              <TrendingUp className="w-5 h-5 text-white" />
            </div>
            <div className="flex flex-col">
              <span className="font-bold text-sm tracking-tight text-slate-900">AI Wealth</span>
              <span className="text-[10px] font-semibold text-emerald-600 uppercase tracking-wider -mt-1">Management</span>
            </div>
          </div>
          <button 
            className="lg:hidden p-2 -mr-2 text-slate-400 hover:bg-slate-50 rounded-lg"
            onClick={closeMobileMenu}
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto py-4">
          <nav className="px-4 space-y-1">
            <div className="px-3 mb-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Menu Chính</div>
            {navItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={closeMobileMenu}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-sm font-medium border border-transparent",
                    isActive 
                      ? "bg-emerald-50 text-emerald-700 border-emerald-100 shadow-sm" 
                      : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <item.icon className={cn("w-4 h-4", isActive ? "text-emerald-600" : "text-slate-400")} />
                    {item.name}
                  </>
                )}
              </NavLink>
            ))}
          </nav>

          {userData?.role === 'admin' && (
            <nav className="px-4 mt-8 space-y-1">
              <div className="px-3 mb-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Hệ thống</div>
              {adminItems.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  onClick={closeMobileMenu}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-sm font-medium border border-transparent",
                      isActive 
                        ? "bg-emerald-50 text-emerald-700 border-emerald-100 shadow-sm" 
                        : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      <item.icon className={cn("w-4 h-4", isActive ? "text-emerald-600" : "text-slate-400")} />
                      {item.name}
                    </>
                  )}
                </NavLink>
              ))}
            </nav>
          )}
        </div>

        <div className="p-4 border-t border-slate-100 space-y-4 bg-slate-50/50">
          <div className="px-2 text-[10px] font-medium text-slate-400 flex justify-between items-center">
            <span>v2.1.0</span>
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
              Hệ thống ổn định
            </span>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 bg-slate-50">
        <header className="h-16 shrink-0 border-b border-slate-200 flex items-center justify-between px-4 sm:px-8 bg-white/80 backdrop-blur-md sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <button 
              className="lg:hidden p-2 -ml-2 text-slate-500 hover:bg-slate-50 rounded-lg"
              onClick={() => setIsMobileMenuOpen(true)}
            >
              <Menu className="w-6 h-6" />
            </button>
            <h1 className="text-sm font-bold text-slate-900 hidden sm:block">
              Bảng điều khiển
            </h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3 sm:pl-4 sm:border-l border-slate-100">
              <div className="text-right hidden sm:block">
                <div className="text-xs font-bold text-slate-900">{userData?.username || 'User'}</div>
                <div className="text-[10px] font-medium text-slate-500 capitalize">{userData?.role || 'user'}</div>
              </div>
              <div className="w-9 h-9 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-xs font-bold text-slate-600">
                {(userData?.username || 'U').substring(0, 2).toUpperCase()}
              </div>
              <button 
                onClick={handleLogout}
                className="ml-1 sm:ml-2 p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                title="Đăng xuất"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </div>
        </header>
        <div className="flex-1 overflow-auto p-4 sm:p-8">
          <div className="max-w-7xl mx-auto">
            <Outlet />
          </div>
        </div>
      </main>
    </div>
  );
}

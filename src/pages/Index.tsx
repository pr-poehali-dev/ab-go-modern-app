import { useState, useEffect, useCallback } from "react";
import Icon from "@/components/ui/icon";

const API = "https://functions.poehali.dev/8e1c6953-6368-43e7-a548-3a878f157df1";

// Стабильный session_id для "избранного" без авторизации
const SESSION_ID = (() => {
  let s = localStorage.getItem("abgo_sid");
  if (!s) { s = Math.random().toString(36).slice(2) + Date.now(); localStorage.setItem("abgo_sid", s); }
  return s;
})();

const CATEGORY_META: Record<string, { icon: string; color: string; bg: string }> = {
  "Работа":       { icon: "Briefcase",    color: "#2563EB", bg: "#EFF6FF" },
  "Услуги":       { icon: "Wrench",       color: "#10B981", bg: "#ECFDF5" },
  "Недвижимость": { icon: "Home",         color: "#F59E0B", bg: "#FFFBEB" },
  "Транспорт":    { icon: "Car",          color: "#EF4444", bg: "#FEF2F2" },
  "IT / Техника": { icon: "Laptop",       color: "#8B5CF6", bg: "#F5F3FF" },
  "Образование":  { icon: "GraduationCap",color: "#EC4899", bg: "#FDF2F8" },
  "Одежда":       { icon: "ShoppingBag",  color: "#14B8A6", bg: "#F0FDFA" },
  "Другое":       { icon: "Zap",          color: "#64748B", bg: "#F8FAFC" },
};

const CAT_EMOJI: Record<string, string> = {
  "Работа": "💼", "Услуги": "🔨", "Недвижимость": "🏠",
  "Транспорт": "🚗", "IT / Техника": "💻", "Образование": "🎓",
  "Одежда": "👗", "Другое": "⚡",
};

const CATEGORIES = Object.entries(CATEGORY_META).map(([label, meta]) => ({ label, ...meta }));

const CHATS = [
  { id: 1, name: "Алексей К.", msg: "Ещё актуально объявление?", time: "14:32", unread: 2, avatar: "👨‍💼" },
  { id: 2, name: "Марина С.", msg: "Договорились, жду в 18:00", time: "13:11", unread: 0, avatar: "👩‍🦰" },
  { id: 3, name: "IT Стартап", msg: "Отправили оффер на почту", time: "вчера", unread: 1, avatar: "🏢" },
  { id: 4, name: "Дмитрий В.", msg: "Можете скинуть фото?", time: "вчера", unread: 0, avatar: "👨‍🔧" },
];

const PROMO_PLANS = [
  { id: "top",   label: "ТОП",   icon: "TrendingUp", color: "#F59E0B", glow: "rgba(245,158,11,0.08)",   price: "299 ₽",   period: "7 дней",  perks: ["Объявление в топе списка", "Выделение цветом", "Метка «ТОП»"], popular: false },
  { id: "vip",   label: "VIP",   icon: "Crown",      color: "#8B5CF6", glow: "rgba(139,92,246,0.08)",   price: "799 ₽",   period: "14 дней", perks: ["ТОП + VIP-метка", "Показ в категории", "Рассылка по базе", "Приоритетная поддержка"], popular: true },
  { id: "turbo", label: "ТУРБО", icon: "Zap",        color: "#EF4444", glow: "rgba(239,68,68,0.08)",    price: "1 490 ₽", period: "30 дней", perks: ["VIP + push-уведомления", "Баннер на главной", "Аналитика просмотров", "Менеджер"], popular: false },
];

type Section = "home" | "listings" | "categories" | "post" | "favorites" | "profile" | "chat" | "search";

interface Listing {
  id: number;
  title: string;
  description: string;
  category: string;
  price: string | null;
  location: string | null;
  badge: string | null;
  views: number;
  created_at: string;
  is_fav: boolean;
}

function timeAgo(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "только что";
  if (diff < 3600) return `${Math.floor(diff / 60)} мин назад`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} ч назад`;
  return `${Math.floor(diff / 86400)} дн назад`;
}

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(API + path, {
    ...opts,
    headers: { "Content-Type": "application/json", "X-Session-Id": SESSION_ID, ...(opts?.headers || {}) },
  });
  return res.json();
}

export default function Index() {
  const [section, setSection] = useState<Section>("home");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [chatOpen, setChatOpen] = useState<number | null>(null);
  const [chatMsg, setChatMsg] = useState("");
  const [postStep, setPostStep] = useState(1);
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [promoOpen, setPromoOpen] = useState(false);

  // Данные из API
  const [listings, setListings] = useState<Listing[]>([]);
  const [totalListings, setTotalListings] = useState(0);
  const [loading, setLoading] = useState(false);

  // Форма
  const [form, setForm] = useState({ title: "", description: "", category: "", price: "", location: "", contact_phone: "" });
  const [posting, setPosting] = useState(false);
  const [postSuccess, setPostSuccess] = useState(false);

  const fetchListings = useCallback(async (badge = "", search = "") => {
    setLoading(true);
    const params = new URLSearchParams();
    if (badge && badge !== "all") params.set("badge", badge);
    if (search) params.set("search", search);
    const data = await apiFetch(`/?${params.toString()}`);
    setListings(data.listings || []);
    setTotalListings(data.total || 0);
    setLoading(false);
  }, []);

  useEffect(() => { fetchListings(); }, [fetchListings]);

  const toggleFav = async (id: number) => {
    const cur = listings.find((l) => l.id === id);
    if (!cur) return;
    // Оптимистично обновляем UI
    setListings((prev) => prev.map((l) => l.id === id ? { ...l, is_fav: !l.is_fav } : l));
    await apiFetch("/favorite", {
      method: "PUT",
      body: JSON.stringify({ listing_id: id, action: cur.is_fav ? "remove" : "add" }),
    });
  };

  const handlePost = async () => {
    if (!form.title || !form.description || !form.category) return;
    setPosting(true);
    await apiFetch("/", { method: "POST", body: JSON.stringify(form) });
    setPosting(false);
    setPostSuccess(true);
    setForm({ title: "", description: "", category: "", price: "", location: "", contact_phone: "" });
    await fetchListings();
    setTimeout(() => { setPostSuccess(false); setPostStep(1); setSection("listings"); }, 1500);
  };

  const filteredListings = listings.filter((l) => {
    if (activeTab !== "all" && l.badge !== activeTab) return false;
    if (searchQuery && !l.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const favListings = listings.filter((l) => l.is_fav);

  // Обновляем список при смене вкладки/поиска
  useEffect(() => {
    if (section === "listings" || section === "home") fetchListings();
  }, [section, fetchListings]);

  return (
    <div className="min-h-screen bg-[#F8F9FC] font-golos">

      {/* HEADER */}
      <header className="sticky top-0 z-40 bg-white border-b border-slate-100 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
          <button onClick={() => setSection("home")} className="flex items-center gap-2 shrink-0">
            <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center">
              <span className="text-white font-montserrat font-black text-sm">AB</span>
            </div>
            <span className="font-montserrat font-bold text-slate-900 text-lg hidden sm:block">AB-GO</span>
          </button>

          <div className="flex-1 max-w-lg relative">
            <Icon name="Search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-400 focus:bg-white transition-all duration-150"
              placeholder="Поиск по объявлениям..."
              value={searchQuery}
              onFocus={() => setSection("search")}
              onChange={(e) => { setSearchQuery(e.target.value); setSection("search"); }}
            />
          </div>

          <nav className="hidden md:flex items-center gap-1">
            {[
              { id: "home", icon: "Home", label: "Главная" },
              { id: "listings", icon: "List", label: "Объявления" },
              { id: "favorites", icon: "Heart", label: "Избранное" },
              { id: "chat", icon: "MessageCircle", label: "Чат" },
              { id: "profile", icon: "User", label: "Кабинет" },
            ].map((n) => (
              <button key={n.id} onClick={() => setSection(n.id as Section)}
                className={`flex flex-col items-center px-3 py-1.5 rounded-xl text-xs font-medium transition-all duration-150 ${section === n.id ? "text-blue-600 bg-blue-50" : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"}`}>
                <Icon name={n.icon} size={18} />
                <span className="mt-0.5">{n.label}</span>
              </button>
            ))}
          </nav>

          <button onClick={() => setSection("post")} className="shrink-0 btn-primary flex items-center gap-2 text-sm">
            <Icon name="Plus" size={16} />
            <span className="hidden sm:inline">Подать</span>
          </button>
        </div>
      </header>

      {/* MAIN */}
      <main className="max-w-6xl mx-auto px-4 py-6">

        {/* ── HOME ── */}
        {section === "home" && (
          <div className="space-y-8 animate-fade-up">
            <div className="promo-card">
              <div className="absolute inset-0 overflow-hidden rounded-2xl">
                <div className="absolute top-0 right-0 w-72 h-72 rounded-full bg-white opacity-10 -translate-y-16 translate-x-16" />
                <div className="absolute bottom-0 left-1/3 w-48 h-48 rounded-full bg-white opacity-10 translate-y-12" />
              </div>
              <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <p className="text-blue-200 text-sm font-medium mb-1">Добро пожаловать в</p>
                  <h1 className="font-montserrat font-black text-4xl sm:text-5xl tracking-tight mb-2">AB-GO</h1>
                  <p className="text-blue-100 text-base max-w-sm">Доска объявлений нового поколения — работа, услуги, IT, образование.</p>
                  <div className="flex gap-3 mt-4 flex-wrap">
                    <button onClick={() => setSection("listings")} className="bg-white text-blue-700 font-semibold px-5 py-2.5 rounded-xl text-sm hover:bg-blue-50 transition-all active:scale-95">Смотреть объявления</button>
                    <button onClick={() => setSection("post")} className="bg-blue-500 bg-opacity-40 text-white border border-blue-400 font-semibold px-5 py-2.5 rounded-xl text-sm hover:bg-opacity-60 transition-all active:scale-95">+ Подать бесплатно</button>
                  </div>
                </div>
                <div className="text-7xl hidden sm:block select-none">🚀</div>
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "Объявлений", value: totalListings.toLocaleString("ru"), icon: "FileText", color: "text-blue-600", bg: "bg-blue-50" },
                { label: "Пользователей", value: "42 000", icon: "Users", color: "text-emerald-600", bg: "bg-emerald-50" },
                { label: "Категорий", value: String(CATEGORIES.length), icon: "Grid3X3", color: "text-amber-600", bg: "bg-amber-50" },
                { label: "Городов", value: "120+", icon: "MapPin", color: "text-purple-600", bg: "bg-purple-50" },
              ].map((s, i) => (
                <div key={i} className="bg-white rounded-2xl p-4 border border-slate-100 animate-fade-up" style={{ animationDelay: `${i * 0.05}s` }}>
                  <div className={`w-9 h-9 ${s.bg} rounded-xl flex items-center justify-center mb-2`}>
                    <Icon name={s.icon} size={18} className={s.color} />
                  </div>
                  <div className={`font-montserrat font-bold text-xl ${s.color}`}>{s.value}</div>
                  <div className="text-slate-500 text-xs mt-0.5">{s.label}</div>
                </div>
              ))}
            </div>

            {/* Categories */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="section-title">Категории</h2>
                <button onClick={() => setSection("categories")} className="text-blue-600 text-sm font-medium hover:underline">Все →</button>
              </div>
              <div className="grid grid-cols-4 sm:grid-cols-8 gap-3">
                {CATEGORIES.map((c, i) => (
                  <button key={i} onClick={() => setSection("listings")} className="cat-card" style={{ animationDelay: `${i * 0.04}s` }}>
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: c.bg }}>
                      <Icon name={c.icon} size={20} style={{ color: c.color }} />
                    </div>
                    <span className="text-xs text-slate-700 font-medium text-center leading-tight">{c.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Recent listings */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="section-title">Свежие объявления</h2>
                <button onClick={() => setSection("listings")} className="text-blue-600 text-sm font-medium hover:underline">Все →</button>
              </div>
              {loading ? (
                <LoadingSkeleton count={3} />
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {listings.slice(0, 3).map((l, i) => (
                    <ListingCard key={l.id} l={l} i={i} toggleFav={toggleFav} onBoost={() => setPromoOpen(true)} />
                  ))}
                </div>
              )}
            </div>

            {/* Promo banner */}
            <div
              className="rounded-2xl p-6 flex flex-col sm:flex-row items-center justify-between gap-4 cursor-pointer hover:scale-[1.01] transition-transform duration-200"
              style={{ background: "linear-gradient(135deg, #1E1B4B, #312E81, #4C1D95)" }}
              onClick={() => setPromoOpen(true)}
            >
              <div>
                <div className="flex items-center gap-2 mb-2"><span className="badge-vip">VIP</span><span className="badge-top">ТОП</span></div>
                <h3 className="font-montserrat font-bold text-white text-xl mb-1">Продвиньте объявление в топ</h3>
                <p className="text-purple-200 text-sm">Увеличьте просмотры в 5–10 раз. Первый результат уже через час.</p>
              </div>
              <button className="shrink-0 bg-white text-purple-700 font-bold px-6 py-3 rounded-xl text-sm hover:bg-purple-50 transition-all active:scale-95">Узнать цены →</button>
            </div>
          </div>
        )}

        {/* ── LISTINGS ── */}
        {section === "listings" && (
          <div className="animate-fade-up space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <h2 className="section-title">Объявления <span className="text-slate-400 font-normal text-lg ml-1">({totalListings})</span></h2>
              <div className="flex gap-2 flex-wrap">
                {[{ id: "all", label: "Все" }, { id: "top", label: "🔥 ТОП" }, { id: "vip", label: "👑 VIP" }, { id: "new", label: "✨ Новые" }].map((t) => (
                  <button key={t.id} onClick={() => setActiveTab(t.id)} className={`tab-btn ${activeTab === t.id ? "active" : ""}`}>{t.label}</button>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-2xl p-4 border border-slate-100 flex flex-wrap gap-3 items-center">
              <div className="relative flex-1 min-w-[200px]">
                <Icon name="Search" size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input className="input-search pl-9 text-sm py-2" placeholder="Поиск..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
              </div>
              <select className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-700 focus:outline-none focus:border-blue-400">
                <option>Все категории</option>
                {CATEGORIES.map((c) => <option key={c.label}>{c.label}</option>)}
              </select>
              <select className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-700 focus:outline-none focus:border-blue-400">
                <option>По дате</option><option>По цене ↑</option><option>По цене ↓</option><option>По просмотрам</option>
              </select>
            </div>

            {loading ? <LoadingSkeleton count={6} /> : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredListings.length > 0 ? filteredListings.map((l, i) => (
                  <ListingCard key={l.id} l={l} i={i} toggleFav={toggleFav} onBoost={() => setPromoOpen(true)} />
                )) : (
                  <div className="col-span-3 text-center py-16 text-slate-400">
                    <Icon name="SearchX" size={40} className="mx-auto mb-3 opacity-40" />
                    <p className="font-medium">Объявления не найдены</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── CATEGORIES ── */}
        {section === "categories" && (
          <div className="animate-fade-up space-y-6">
            <h2 className="section-title">Категории</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {CATEGORIES.map((c, i) => (
                <button key={i} onClick={() => setSection("listings")} className="bg-white rounded-2xl p-5 border border-slate-100 flex flex-col items-center gap-3 hover:-translate-y-1 hover:shadow-md transition-all duration-200">
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: c.bg }}>
                    <Icon name={c.icon} size={28} style={{ color: c.color }} />
                  </div>
                  <div>
                    <div className="font-semibold text-slate-800 text-center">{c.label}</div>
                    <div className="text-slate-400 text-xs text-center mt-0.5">{listings.filter((l) => l.category === c.label).length} объявлений</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── POST ── */}
        {section === "post" && (
          <div className="animate-fade-up max-w-2xl mx-auto space-y-6">
            <h2 className="section-title">Подать объявление</h2>
            <div className="flex items-center gap-2">
              {[1, 2, 3].map((s) => (
                <div key={s} className="flex items-center gap-2">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${postStep >= s ? "bg-blue-600 text-white" : "bg-slate-200 text-slate-400"}`}>{s}</div>
                  {s < 3 && <div className={`h-0.5 w-12 ${postStep > s ? "bg-blue-600" : "bg-slate-200"}`} />}
                </div>
              ))}
              <div className="ml-2 text-slate-500 text-sm">{postStep === 1 && "Основное"}{postStep === 2 && "Детали"}{postStep === 3 && "Продвижение"}</div>
            </div>

            <div className="bg-white rounded-2xl p-6 border border-slate-100 space-y-4">
              {postSuccess && (
                <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl px-4 py-3 text-sm font-medium flex items-center gap-2">
                  <Icon name="CheckCircle" size={18} />
                  Объявление опубликовано!
                </div>
              )}

              {postStep === 1 && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Заголовок *</label>
                    <input className="input-search" placeholder="Например: Разработчик React ищет проект" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Категория *</label>
                    <select className="input-search" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                      <option value="">Выберите категорию</option>
                      {CATEGORIES.map((c) => <option key={c.label}>{c.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Описание *</label>
                    <textarea className="input-search min-h-[120px] resize-none" placeholder="Подробно опишите предложение..." value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                  </div>
                  <button onClick={() => { if (form.title && form.description && form.category) setPostStep(2); }} className="btn-primary w-full text-center" style={{ opacity: form.title && form.description && form.category ? 1 : 0.5 }}>
                    Далее →
                  </button>
                </>
              )}

              {postStep === 2 && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">Цена</label>
                      <input className="input-search" placeholder="0 ₽" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">Город</label>
                      <input className="input-search" placeholder="Москва" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Телефон</label>
                    <input className="input-search" placeholder="+7 (___) ___-__-__" value={form.contact_phone} onChange={(e) => setForm({ ...form, contact_phone: e.target.value })} />
                  </div>
                  <div className="flex gap-3">
                    <button onClick={() => setPostStep(1)} className="btn-outline flex-1 text-center">← Назад</button>
                    <button onClick={() => setPostStep(3)} className="btn-primary flex-1 text-center">Далее →</button>
                  </div>
                </>
              )}

              {postStep === 3 && (
                <>
                  <div className="text-center mb-4">
                    <div className="font-montserrat font-bold text-lg text-slate-900">Продвижение объявления</div>
                    <p className="text-slate-500 text-sm mt-1">Выберите тариф или пропустите этот шаг</p>
                  </div>
                  <div className="space-y-3">
                    {PROMO_PLANS.map((plan) => (
                      <PromoPlanCard key={plan.id} plan={plan} selected={selectedPlan === plan.id} onSelect={setSelectedPlan} compact />
                    ))}
                  </div>
                  <div className="flex gap-3 mt-2">
                    <button onClick={() => setPostStep(2)} className="btn-outline flex-1 text-center">← Назад</button>
                    <button
                      className="btn-primary flex-1 text-center"
                      onClick={handlePost}
                      disabled={posting}
                      style={{ opacity: posting ? 0.7 : 1 }}
                    >
                      {posting ? "Публикация..." : selectedPlan ? "Оплатить и опубликовать" : "Опубликовать бесплатно"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* ── FAVORITES ── */}
        {section === "favorites" && (
          <div className="animate-fade-up space-y-5">
            <h2 className="section-title">Избранное ({favListings.length})</h2>
            {favListings.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {favListings.map((l, i) => (
                  <ListingCard key={l.id} l={l} i={i} toggleFav={toggleFav} onBoost={() => setPromoOpen(true)} />
                ))}
              </div>
            ) : (
              <div className="text-center py-24 text-slate-400">
                <Icon name="HeartOff" size={48} className="mx-auto mb-3 opacity-30" />
                <p className="font-medium text-lg">Нет избранных объявлений</p>
                <p className="text-sm mt-1">Нажмите ❤️ на объявлении, чтобы добавить</p>
                <button onClick={() => setSection("listings")} className="btn-primary mt-4 inline-flex">Смотреть объявления</button>
              </div>
            )}
          </div>
        )}

        {/* ── PROFILE ── */}
        {section === "profile" && (
          <div className="animate-fade-up max-w-2xl mx-auto space-y-5">
            <h2 className="section-title">Личный кабинет</h2>
            <div className="bg-white rounded-2xl p-6 border border-slate-100">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center text-3xl">👤</div>
                <div>
                  <div className="font-montserrat font-bold text-xl text-slate-900">Гость</div>
                  <div className="text-slate-500 text-sm">Войдите, чтобы управлять объявлениями</div>
                </div>
                <button className="ml-auto btn-primary text-sm">Войти</button>
              </div>
              <div className="grid grid-cols-3 gap-3 pt-4 border-t border-slate-100">
                {[
                  { label: "Объявлений", value: String(totalListings), icon: "FileText", color: "text-blue-600" },
                  { label: "В избранном", value: String(favListings.length), icon: "Heart", color: "text-red-500" },
                  { label: "Категорий", value: String(CATEGORIES.length), icon: "Grid3X3", color: "text-amber-500" },
                ].map((s, i) => (
                  <div key={i} className="text-center p-3 bg-slate-50 rounded-xl">
                    <Icon name={s.icon} size={20} className={`mx-auto mb-1 ${s.color}`} />
                    <div className="font-montserrat font-bold text-lg text-slate-900">{s.value}</div>
                    <div className="text-slate-500 text-xs">{s.label}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-white rounded-2xl border border-slate-100 divide-y divide-slate-100 overflow-hidden">
              {[
                { icon: "FileText", label: "Мои объявления", badge: null },
                { icon: "TrendingUp", label: "Продвижение", badge: null },
                { icon: "Bell", label: "Уведомления", badge: null },
                { icon: "HelpCircle", label: "Поддержка", badge: null },
              ].map((item, i) => (
                <button key={i} className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition-colors text-left">
                  <div className="flex items-center gap-3">
                    <Icon name={item.icon} size={20} className="text-slate-500" />
                    <span className="font-medium text-sm text-slate-800">{item.label}</span>
                  </div>
                  <Icon name="ChevronRight" size={16} className="text-slate-300" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── CHAT ── */}
        {section === "chat" && (
          <div className="animate-fade-up max-w-2xl mx-auto space-y-4">
            <h2 className="section-title">Сообщения</h2>
            {chatOpen === null ? (
              <div className="bg-white rounded-2xl border border-slate-100 divide-y divide-slate-50 overflow-hidden">
                {CHATS.map((c) => (
                  <button key={c.id} onClick={() => setChatOpen(c.id)} className="w-full flex items-center gap-4 px-5 py-4 hover:bg-slate-50 transition-colors text-left">
                    <div className="text-3xl">{c.avatar}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-slate-900 text-sm">{c.name}</span>
                        <span className="text-slate-400 text-xs">{c.time}</span>
                      </div>
                      <p className="text-slate-500 text-sm truncate mt-0.5">{c.msg}</p>
                    </div>
                    {c.unread > 0 && <span className="bg-blue-600 text-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center shrink-0">{c.unread}</span>}
                  </button>
                ))}
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-slate-100 flex flex-col" style={{ height: "520px" }}>
                <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100">
                  <button onClick={() => setChatOpen(null)} className="text-slate-400 hover:text-slate-700"><Icon name="ArrowLeft" size={20} /></button>
                  <div className="text-2xl">{CHATS.find((c) => c.id === chatOpen)?.avatar}</div>
                  <div>
                    <div className="font-semibold text-slate-900 text-sm">{CHATS.find((c) => c.id === chatOpen)?.name}</div>
                    <div className="text-emerald-500 text-xs">Онлайн</div>
                  </div>
                </div>
                <div className="flex-1 p-5 space-y-3 overflow-y-auto">
                  <div className="flex justify-start"><div className="bg-slate-100 rounded-2xl rounded-tl-sm px-4 py-2.5 text-sm text-slate-800 max-w-xs">Привет! Ещё актуально объявление?</div></div>
                  <div className="flex justify-end"><div className="bg-blue-600 rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm text-white max-w-xs">Да, всё актуально! Что вас интересует?</div></div>
                  <div className="flex justify-start"><div className="bg-slate-100 rounded-2xl rounded-tl-sm px-4 py-2.5 text-sm text-slate-800 max-w-xs">Можете подробнее рассказать об условиях?</div></div>
                </div>
                <div className="px-4 py-3 border-t border-slate-100 flex gap-3">
                  <input className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-blue-400" placeholder="Написать сообщение..." value={chatMsg} onChange={(e) => setChatMsg(e.target.value)} />
                  <button className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white hover:bg-blue-700 transition-colors active:scale-95"><Icon name="Send" size={17} /></button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── SEARCH ── */}
        {section === "search" && (
          <div className="animate-fade-up space-y-5">
            <h2 className="section-title">Поиск</h2>
            <div className="relative">
              <Icon name="Search" size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
              <input autoFocus className="input-search pl-12 text-base" placeholder="Что ищете?" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
            </div>
            {!searchQuery ? (
              <div>
                <p className="text-slate-500 text-sm font-medium mb-3">Популярные запросы</p>
                <div className="flex flex-wrap gap-2">
                  {["React разработчик", "Ремонт квартиры", "Курсы английского", "Продажа авто", "Фотограф", "Репетитор"].map((q) => (
                    <button key={q} onClick={() => setSearchQuery(q)} className="bg-white border border-slate-200 text-slate-700 text-sm px-4 py-2 rounded-xl hover:border-blue-400 hover:text-blue-600 transition-all">{q}</button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {listings.filter((l) => l.title.toLowerCase().includes(searchQuery.toLowerCase())).length > 0
                  ? listings.filter((l) => l.title.toLowerCase().includes(searchQuery.toLowerCase())).map((l, i) => (
                    <ListingCard key={l.id} l={l} i={i} toggleFav={toggleFav} onBoost={() => setPromoOpen(true)} />
                  ))
                  : <div className="col-span-3 text-center py-16 text-slate-400"><Icon name="SearchX" size={40} className="mx-auto mb-3 opacity-40" /><p className="font-medium">Ничего не найдено по запросу «{searchQuery}»</p></div>
                }
              </div>
            )}
          </div>
        )}
      </main>

      {/* PROMO MODAL */}
      {promoOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => setPromoOpen(false)}>
          <div className="bg-white rounded-3xl w-full max-w-2xl p-6 shadow-2xl animate-fade-up" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="font-montserrat font-bold text-2xl text-slate-900">Продвижение в топ</h3>
                <p className="text-slate-500 text-sm mt-0.5">Больше просмотров → больше откликов</p>
              </div>
              <button onClick={() => setPromoOpen(false)} className="text-slate-400 hover:text-slate-700 p-2"><Icon name="X" size={22} /></button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              {PROMO_PLANS.map((plan) => (
                <PromoPlanCard key={plan.id} plan={plan} selected={selectedPlan === plan.id} onSelect={setSelectedPlan} />
              ))}
            </div>
            <button className="btn-primary w-full text-center text-base py-3" style={{ opacity: selectedPlan ? 1 : 0.5, cursor: selectedPlan ? "pointer" : "not-allowed" }}>
              {selectedPlan ? `Подключить ${PROMO_PLANS.find((p) => p.id === selectedPlan)?.label}` : "Выберите тариф"}
            </button>
          </div>
        </div>
      )}

      {/* BOTTOM NAV mobile */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-slate-100">
        <div className="flex">
          {[
            { id: "home", icon: "Home", label: "Главная" },
            { id: "listings", icon: "List", label: "Объявления" },
            { id: "post", icon: "PlusCircle", label: "Подать" },
            { id: "favorites", icon: "Heart", label: "Избранное" },
            { id: "profile", icon: "User", label: "Кабинет" },
          ].map((n) => (
            <button key={n.id} onClick={() => setSection(n.id as Section)}
              className={`flex-1 flex flex-col items-center py-3 gap-0.5 transition-all duration-150 ${n.id === "post" ? "relative -top-3" : ""} ${section === n.id ? "text-blue-600" : "text-slate-400"}`}>
              {n.id === "post" ? (
                <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg">
                  <Icon name="Plus" size={22} className="text-white" />
                </div>
              ) : (
                <><Icon name={n.icon} size={20} /><span className="text-[10px] font-medium">{n.label}</span></>
              )}
            </button>
          ))}
        </div>
      </nav>
      <div className="md:hidden h-20" />
    </div>
  );
}

function LoadingSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
          <div className="h-36 bg-slate-100 shimmer" />
          <div className="p-4 space-y-2">
            <div className="h-4 bg-slate-100 rounded shimmer w-3/4" />
            <div className="h-3 bg-slate-100 rounded shimmer w-full" />
            <div className="h-5 bg-slate-100 rounded shimmer w-1/3 mt-2" />
          </div>
        </div>
      ))}
    </div>
  );
}

function ListingCard({ l, i, toggleFav, onBoost }: { l: Listing; i: number; toggleFav: (id: number) => void; onBoost: () => void }) {
  const emoji = CAT_EMOJI[l.category] || "📌";
  return (
    <div
      className={`bg-white rounded-2xl border overflow-hidden card-hover animate-fade-up cursor-pointer ${l.badge === "top" ? "top-glow border-amber-200" : l.badge === "vip" ? "vip-glow border-purple-200" : "border-slate-100"}`}
      style={{ animationDelay: `${i * 0.06}s` }}
    >
      <div className="h-36 bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center relative">
        <span className="text-5xl select-none">{emoji}</span>
        <div className="absolute top-3 left-3 flex gap-1">
          {l.badge === "top" && <span className="badge-top">ТОП</span>}
          {l.badge === "vip" && <span className="badge-vip">VIP</span>}
          {l.badge === "new" && <span className="badge-new">Новое</span>}
        </div>
        <button onClick={(e) => { e.stopPropagation(); toggleFav(l.id); }}
          className="absolute top-3 right-3 w-8 h-8 bg-white rounded-xl flex items-center justify-center shadow-sm hover:scale-110 transition-transform">
          <Icon name="Heart" size={15} className={l.is_fav ? "text-red-500" : "text-slate-400"} style={l.is_fav ? { fill: "#EF4444" } : {}} />
        </button>
      </div>
      <div className="p-4">
        <div className="font-semibold text-slate-900 text-sm leading-snug line-clamp-2 mb-1">{l.title}</div>
        <p className="text-slate-400 text-xs line-clamp-2 mb-3">{l.description}</p>
        <div className="font-montserrat font-bold text-blue-600 text-base mb-3">{l.price || "Договорная"}</div>
        <div className="flex items-center justify-between text-xs text-slate-400 pt-3 border-t border-slate-50">
          <div className="flex items-center gap-1"><Icon name="MapPin" size={12} /><span>{l.location || "—"}</span></div>
          <div className="flex items-center gap-1"><Icon name="Eye" size={12} /><span>{l.views}</span></div>
          <div className="flex items-center gap-1"><Icon name="Clock" size={12} /><span>{timeAgo(l.created_at)}</span></div>
        </div>
        {!l.badge && (
          <button onClick={(e) => { e.stopPropagation(); onBoost(); }} className="mt-3 w-full text-center text-xs text-amber-600 font-semibold bg-amber-50 hover:bg-amber-100 rounded-xl py-2 transition-colors duration-150">
            🔥 Продвинуть в ТОП
          </button>
        )}
      </div>
    </div>
  );
}

function PromoPlanCard({ plan, selected, onSelect, compact = false }: { plan: typeof PROMO_PLANS[0]; selected: boolean; onSelect: (id: string) => void; compact?: boolean }) {
  return (
    <div onClick={() => onSelect(plan.id)}
      className={`relative rounded-2xl border-2 cursor-pointer transition-all duration-200 ${selected ? "scale-[1.02] shadow-lg" : "hover:scale-[1.01] hover:shadow-md"} ${compact ? "p-3" : "p-5"}`}
      style={{ borderColor: selected ? plan.color : "#E2E8F0", background: selected ? plan.glow : "white" }}>
      {plan.popular && !compact && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-purple-600 text-white text-xs font-bold px-3 py-1 rounded-full whitespace-nowrap">Популярный</div>
      )}
      <div className={`flex ${compact ? "flex-row items-center gap-3" : "flex-col items-center text-center"}`}>
        <div className={`rounded-xl flex items-center justify-center shrink-0 ${compact ? "w-9 h-9" : "w-12 h-12 mb-3"}`} style={{ background: `${plan.color}20` }}>
          <Icon name={plan.icon} size={compact ? 18 : 24} style={{ color: plan.color }} />
        </div>
        <div className={compact ? "flex-1" : ""}>
          <div className="font-montserrat font-bold text-slate-900" style={{ fontSize: compact ? "14px" : "16px" }}>{plan.label}</div>
          <div className="font-bold" style={{ color: plan.color, fontSize: compact ? "13px" : "22px" }}>
            {plan.price}<span className="text-slate-400 font-normal text-xs"> / {plan.period}</span>
          </div>
        </div>
        {!compact && (
          <ul className="text-left mt-3 space-y-1.5 w-full">
            {plan.perks.map((p, i) => (
              <li key={i} className="flex items-start gap-2 text-slate-600 text-xs">
                <Icon name="Check" size={13} className="mt-0.5 shrink-0" style={{ color: plan.color }} />{p}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

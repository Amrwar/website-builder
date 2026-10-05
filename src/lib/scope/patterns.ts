import type { Locale } from "@/config/locales";
import type { CapabilityKey } from "./capabilities";

/**
 * Phrase patterns for free-text detection.
 *
 * These are *signals*, not declarations: a text match is reported with the
 * phrase that triggered it so the customer can see and dispute it, whereas a
 * configurator selection is taken as authoritative. Treating prose as proof is
 * how a rule engine starts quietly overcharging people.
 *
 * `multi_role_access` is intentionally absent here -- it is inferred by
 * counting distinct actor groups (see `actors.ts`), because any single word
 * like "staff" is far too weak to justify moving a project up two tiers.
 */

export type PatternSet = Partial<Record<CapabilityKey, readonly string[]>>;

const en: PatternSet = {
  hosted_checkout: [
    "pay online",
    "online payment",
    "online payments",
    "accept payments",
    "take payments",
    "checkout",
    "credit card",
    "pay by card",
  ],
  product_catalog: [
    "product catalog",
    "catalogue",
    "online store",
    "webshop",
    "shopping cart",
    "order food",
    "menu items",
    "list products",
    "sell products",
  ],
  subscriptions: [
    "subscription",
    "subscriptions",
    "recurring payment",
    "membership",
    "monthly plan",
  ],
  booking_scheduling: [
    "booking",
    "bookings",
    "appointment",
    "appointments",
    "reservation",
    "reservations",
    "scheduling",
  ],
  marketplace_payouts: [
    "marketplace",
    "payout",
    "payouts",
    "commission",
    "multiple vendors",
    "sellers get paid",
    "split payment",
  ],

  user_accounts: [
    "sign up",
    "log in",
    "login",
    "user account",
    "user accounts",
    "profiles",
    "register",
  ],

  realtime_location_tracking: [
    "track drivers",
    "track the driver",
    "track driver",
    "live location",
    "real time tracking",
    "realtime tracking",
    "live tracking",
    "track delivery",
    "track their order on a map",
    "see where the driver is",
    "gps tracking",
  ],
  live_updates: [
    "real time",
    "realtime",
    "live updates",
    "updates instantly",
    "live status",
  ],
  chat_messaging: [
    "chat",
    "messaging",
    "send messages",
    "message each other",
    "in app chat",
  ],
  push_notifications: [
    "push notification",
    "push notifications",
    "notify users",
    "send notifications",
  ],

  admin_dashboard: [
    "admin dashboard",
    "admin panel",
    "back office",
    "management dashboard",
    "control panel",
  ],
  order_management: [
    "manage orders",
    "order management",
    "order status",
    "process orders",
    "incoming orders",
  ],
  inventory: ["inventory", "stock levels", "stock management", "warehouse"],
  reporting: ["reports", "reporting", "analytics", "statistics", "insights dashboard"],
  // Action phrases only. A bare noun like "courier" says someone exists, not
  // that the build must manage them -- matching it would charge a customer
  // for dispatch logistics merely for mentioning a delivery person.
  dispatch_logistics: [
    "manage deliveries",
    "managing deliveries",
    "delivery drivers",
    "assign deliveries",
    "assign orders to drivers",
    "dispatch",
    "route planning",
    "fleet management",
  ],

  third_party_integration: [
    "integrate with",
    "integration with",
    "connect to our",
    "sync with",
    "our existing system",
  ],
  data_migration: [
    "migrate",
    "migration",
    "import our data",
    "existing data",
    "move our data",
  ],
  public_api: ["public api", "api for partners", "expose an api", "developer api"],

  multilingual: [
    "multiple languages",
    "multilingual",
    "bilingual",
    "arabic and english",
    "in french and english",
  ],
  cms_editing: [
    "update the content myself",
    "edit content",
    "content management",
    "cms",
    "manage content",
  ],
  blog: ["blog", "news section", "articles"],
  contact_forms: ["contact form", "enquiry form", "inquiry form", "get in touch form"],

  native_device_features: [
    "camera",
    "bluetooth",
    "nfc",
    "biometric",
    "face id",
    "fingerprint",
    "device sensors",
  ],
  offline_sync: ["offline", "without internet", "works offline", "sync when back online"],
};

const fr: PatternSet = {
  hosted_checkout: [
    "payer en ligne",
    "paiement en ligne",
    "paiements en ligne",
    "accepter les paiements",
    "carte de credit",
    "paiement par carte",
  ],
  product_catalog: [
    "catalogue",
    "boutique en ligne",
    "panier",
    "commander des plats",
    "vendre des produits",
    "liste de produits",
  ],
  subscriptions: ["abonnement", "abonnements", "paiement recurrent", "adhesion"],
  booking_scheduling: [
    "reservation",
    "reservations",
    "rendez vous",
    "prise de rendez vous",
    "planification",
  ],
  marketplace_payouts: [
    "place de marche",
    "versement",
    "versements",
    "commission",
    "plusieurs vendeurs",
    "paiement partage",
  ],

  user_accounts: [
    "inscription",
    "connexion",
    "compte utilisateur",
    "comptes utilisateurs",
    "profils",
    "s inscrire",
  ],

  realtime_location_tracking: [
    "suivre les livreurs",
    "suivre le livreur",
    "localisation en direct",
    "suivi en temps reel",
    "suivi en direct",
    "suivre la livraison",
    "geolocalisation",
  ],
  live_updates: ["temps reel", "mises a jour en direct", "statut en direct"],
  chat_messaging: ["messagerie", "discussion", "envoyer des messages", "clavardage"],
  push_notifications: [
    "notification push",
    "notifications push",
    "notifier les utilisateurs",
  ],

  admin_dashboard: [
    "tableau de bord administrateur",
    "panneau d administration",
    "back office",
    "tableau de bord de gestion",
  ],
  order_management: [
    "gerer les commandes",
    "gestion des commandes",
    "statut des commandes",
    "traiter les commandes",
  ],
  inventory: ["inventaire", "stock", "gestion des stocks", "entrepot"],
  reporting: ["rapports", "statistiques", "analytique", "analyses"],
  dispatch_logistics: [
    "gerer les livraisons",
    "livreurs",
    "affecter les livraisons",
    "repartition",
    "coursier",
    "planification des tournees",
    "flotte",
  ],

  third_party_integration: [
    "integrer avec",
    "integration avec",
    "connecter a notre",
    "synchroniser avec",
    "notre systeme existant",
  ],
  data_migration: ["migrer", "migration", "importer nos donnees", "donnees existantes"],
  public_api: ["api publique", "api pour partenaires"],

  multilingual: [
    "plusieurs langues",
    "multilingue",
    "bilingue",
    "en francais et en anglais",
  ],
  cms_editing: [
    "modifier le contenu moi meme",
    "gestion de contenu",
    "modifier le contenu",
  ],
  blog: ["blogue", "blog", "actualites", "articles"],
  contact_forms: ["formulaire de contact", "formulaire de demande"],

  native_device_features: [
    "camera",
    "bluetooth",
    "nfc",
    "biometrique",
    "empreinte digitale",
    "capteurs",
  ],
  offline_sync: ["hors ligne", "sans internet", "fonctionne hors ligne"],
};

const ar: PatternSet = {
  hosted_checkout: [
    "الدفع عبر الانترنت",
    "يدفعون عبر الانترنت",
    "الدفع اونلاين",
    "دفع الكتروني",
    "قبول المدفوعات",
    "بطاقه ائتمان",
    "بوابه دفع",
  ],
  product_catalog: [
    "متجر الكتروني",
    "كتالوج",
    "سله التسوق",
    "طلب الطعام",
    "بيع المنتجات",
    "قائمه المنتجات",
  ],
  subscriptions: ["اشتراك", "اشتراكات", "دفع متكرر", "عضويه"],
  booking_scheduling: ["حجز", "حجوزات", "مواعيد", "جدوله"],
  marketplace_payouts: [
    "سوق الكتروني",
    "تحويل الارباح",
    "عموله",
    "عده بائعين",
    "تقسيم المدفوعات",
  ],

  user_accounts: [
    "تسجيل الدخول",
    "انشاء حساب",
    "حساب مستخدم",
    "حسابات المستخدمين",
    "ملف شخصي",
  ],

  realtime_location_tracking: [
    "تتبع السائق",
    "تتبع السائقين",
    "يتابع السائقين",
    "متابعه السائقين",
    "تتبع مباشر",
    "الموقع المباشر",
    "تتبع الطلب على الخريطه",
    "تحديد المواقع",
  ],
  live_updates: ["الوقت الفعلي", "تحديثات مباشره", "حاله مباشره"],
  chat_messaging: ["محادثه", "مراسله", "ارسال رسائل", "دردشه"],
  push_notifications: ["اشعارات", "اشعار فوري", "تنبيهات"],

  admin_dashboard: ["لوحه تحكم", "لوحه الاداره", "لوحه تحكم اداريه"],
  order_management: [
    "اداره الطلبات",
    "يدير الطلبات",
    "الموظفين الطلبات",
    "حاله الطلب",
    "معالجه الطلبات",
    "متابعه الطلبات",
  ],
  inventory: ["المخزون", "اداره المخزون", "مستودع"],
  reporting: ["تقارير", "احصائيات", "تحليلات"],
  dispatch_logistics: [
    "اداره التوصيل",
    "يدير التوصيل",
    "السائقين التوصيل",
    "سائقي التوصيل",
    "توزيع الطلبات",
    "مندوب توصيل",
    "مندوبي التوصيل",
    "تخطيط المسارات",
  ],

  third_party_integration: ["الربط مع", "التكامل مع", "مزامنه مع", "نظامنا الحالي"],
  data_migration: ["ترحيل البيانات", "استيراد بياناتنا", "بيانات حاليه"],
  public_api: ["واجهه برمجيه عامه", "api للشركاء"],

  multilingual: ["عده لغات", "متعدد اللغات", "ثنائي اللغه", "بالعربيه والانجليزيه"],
  cms_editing: ["تعديل المحتوى بنفسي", "اداره المحتوى", "تحرير المحتوى"],
  blog: ["مدونه", "اخبار", "مقالات"],
  contact_forms: ["نموذج اتصال", "نموذج تواصل"],

  native_device_features: ["الكاميرا", "بلوتوث", "بصمه", "التعرف على الوجه", "مستشعرات"],
  offline_sync: ["بدون انترنت", "يعمل دون اتصال", "وضع عدم الاتصال"],
};

const PATTERNS: Record<Locale, PatternSet> = { en, fr, ar };

export function patternsFor(locale: Locale): PatternSet {
  return PATTERNS[locale];
}

/**
 * English patterns are also applied as a fallback for every locale.
 *
 * Briefs are routinely written with English technical vocabulary mixed into
 * another language ("نريد dashboard"), and missing those would under-scope the
 * project -- the failure mode that undercharges us and disappoints them.
 */
export function fallbackPatterns(): PatternSet {
  return en;
}

import type { Locale } from "@/config/locales";
import { containsPhrase } from "./normalize";

/**
 * Actor groups.
 *
 * `multi_role_access` is inferred from how many *distinct* kinds of person a
 * brief describes, not from any single keyword. A brief mentioning "staff"
 * once is an ordinary build; a brief describing customers, staff and drivers
 * is three separate interfaces with three separate permission sets, and that
 * is what actually makes it a bigger job.
 *
 * Synonyms are grouped so that "driver", "courier" and "rider" count once, not
 * three times.
 */

export interface ActorGroup {
  id: string;
  terms: Partial<Record<Locale, readonly string[]>>;
}

export const ACTOR_GROUPS: readonly ActorGroup[] = [
  {
    id: "customer",
    terms: {
      en: ["customer", "customers", "client", "clients", "buyer", "buyers", "guest", "guests", "shopper", "shoppers"],
      fr: ["client", "clients", "cliente", "clientes", "acheteur", "acheteurs", "invite", "invites"],
      ar: ["عميل", "العملاء", "عملاء", "زبون", "الزبائن", "زبائن", "مشتري", "المشترين"],
    },
  },
  {
    id: "staff",
    terms: {
      en: ["staff", "employee", "employees", "worker", "workers", "waiter", "waiters", "cashier", "receptionist", "team members"],
      fr: ["personnel", "employe", "employes", "employee", "serveur", "serveurs", "caissier", "receptionniste"],
      ar: ["موظف", "الموظفين", "موظفين", "العاملين", "طاقم", "نادل", "كاشير"],
    },
  },
  {
    id: "manager",
    terms: {
      en: ["manager", "managers", "supervisor", "supervisors", "owner", "owners"],
      fr: ["gerant", "gerants", "responsable", "responsables", "superviseur", "proprietaire"],
      ar: ["مدير", "المدير", "المديرين", "مشرف", "المشرفين", "صاحب المطعم", "المالك"],
    },
  },
  {
    id: "admin",
    terms: {
      en: ["admin", "admins", "administrator", "administrators", "moderator", "moderators"],
      fr: ["administrateur", "administrateurs", "moderateur", "moderateurs"],
      ar: ["مسؤول", "المسؤولين", "اداري", "الاداريين", "مشرف النظام"],
    },
  },
  {
    id: "courier",
    terms: {
      en: ["driver", "drivers", "courier", "couriers", "rider", "riders", "delivery person", "delivery people", "delivery staff"],
      fr: ["livreur", "livreurs", "coursier", "coursiers", "chauffeur", "chauffeurs"],
      ar: ["سائق", "السائق", "السائقين", "سائقين", "مندوب التوصيل", "مندوبي التوصيل"],
    },
  },
  {
    id: "vendor",
    terms: {
      en: ["vendor", "vendors", "seller", "sellers", "merchant", "merchants", "supplier", "suppliers", "restaurant owner"],
      fr: ["vendeur", "vendeurs", "marchand", "marchands", "fournisseur", "fournisseurs"],
      ar: ["بائع", "البائعين", "بائعين", "تاجر", "التجار", "مورد", "الموردين"],
    },
  },
  {
    id: "professional",
    terms: {
      en: ["doctor", "doctors", "teacher", "teachers", "instructor", "instructors", "trainer", "trainers", "agent", "agents", "technician", "technicians"],
      fr: ["medecin", "medecins", "enseignant", "enseignants", "formateur", "formateurs", "technicien", "techniciens"],
      ar: ["طبيب", "الاطباء", "معلم", "المعلمين", "مدرب", "المدربين", "فني", "الفنيين"],
    },
  },
  {
    id: "member",
    terms: {
      en: ["student", "students", "patient", "patients", "member", "members", "subscriber", "subscribers"],
      fr: ["etudiant", "etudiants", "patient", "patients", "membre", "membres", "abonne", "abonnes"],
      ar: ["طالب", "الطلاب", "مريض", "المرضى", "عضو", "الاعضاء", "مشترك", "المشتركين"],
    },
  },
] as const;

/**
 * Number of distinct actor groups at which a brief is treated as multi-role.
 *
 * Three, not two: a customer plus an administrator is the shape of almost
 * every ordinary application and must stay inside the entry tiers. A third
 * distinct group is the point where interfaces and permission rules start
 * multiplying.
 */
export const MULTI_ROLE_THRESHOLD = 3;

export interface ActorDetection {
  groupIds: readonly string[];
  /** The matched term per group, kept as displayable evidence. */
  evidence: readonly string[];
}

/** Finds distinct actor groups mentioned in already-normalised text. */
export function detectActors(normalizedText: string, locale: Locale): ActorDetection {
  const groupIds: string[] = [];
  const evidence: string[] = [];

  for (const group of ACTOR_GROUPS) {
    // Check the brief's own language first, then English, since technical and
    // business vocabulary is frequently written in English regardless.
    const candidates = [...(group.terms[locale] ?? []), ...(group.terms.en ?? [])];
    const hit = candidates.find((term) => containsPhrase(normalizedText, term));
    if (hit) {
      groupIds.push(group.id);
      evidence.push(hit);
    }
  }

  return { groupIds, evidence };
}

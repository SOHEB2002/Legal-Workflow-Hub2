import { z } from "zod";

export const UserRole = {
  ADMIN: "admin",
  LAWYER: "lawyer", 
  SECRETARY: "secretary",
} as const;

export type UserRoleType = typeof UserRole[keyof typeof UserRole];

export const CaseType = {
  CONSULTATION: "استشارة",
  CONTRACT: "عقد",
  GENERAL: "قضية عامة",
  COMMERCIAL: "تجاري",
  LABOR: "عمالي",
  ADMINISTRATIVE: "إداري",
} as const;

export type CaseTypeValue = typeof CaseType[keyof typeof CaseType];

export const CaseStatus = {
  NEW: "جديد",
  IN_PROGRESS: "قيد التنفيذ",
  REVIEW: "مراجعة",
  READY: "جاهز للتسليم",
  CLOSED: "مغلق",
} as const;

export type CaseStatusValue = typeof CaseStatus[keyof typeof CaseStatus];

export interface User {
  id: string;
  username: string;
  password: string;
  name: string;
  role: UserRoleType;
}

export interface LawCase {
  id: string;
  clientName: string;
  caseType: CaseTypeValue;
  status: CaseStatusValue;
  whatsappLink: string;
  driveLink: string;
  nextHearingDate: string | null;
  notes: string;
  reviewNotes: string;
  assignedTo: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export const insertUserSchema = z.object({
  username: z.string().min(3),
  password: z.string().min(4),
  name: z.string().min(2),
  role: z.enum(["admin", "lawyer", "secretary"]),
});

export type InsertUser = z.infer<typeof insertUserSchema>;

export const insertCaseSchema = z.object({
  clientName: z.string().min(2, "اسم العميل مطلوب"),
  caseType: z.enum([
    "استشارة",
    "عقد",
    "قضية عامة",
    "تجاري",
    "عمالي",
    "إداري",
  ]),
  whatsappLink: z.string().optional().default(""),
  driveLink: z.string().optional().default(""),
  nextHearingDate: z.string().nullable().optional(),
  notes: z.string().optional().default(""),
});

export type InsertCase = z.infer<typeof insertCaseSchema>;

export const updateCaseSchema = z.object({
  clientName: z.string().min(2).optional(),
  caseType: z.enum([
    "استشارة",
    "عقد",
    "قضية عامة",
    "تجاري",
    "عمالي",
    "إداري",
  ]).optional(),
  status: z.enum([
    "جديد",
    "قيد التنفيذ",
    "مراجعة",
    "جاهز للتسليم",
    "مغلق",
  ]).optional(),
  whatsappLink: z.string().optional(),
  driveLink: z.string().optional(),
  nextHearingDate: z.string().nullable().optional(),
  notes: z.string().optional(),
  reviewNotes: z.string().optional(),
  assignedTo: z.string().nullable().optional(),
});

export type UpdateCase = z.infer<typeof updateCaseSchema>;

export const loginSchema = z.object({
  username: z.string().min(1, "اسم المستخدم مطلوب"),
  password: z.string().min(1, "كلمة المرور مطلوبة"),
});

export type LoginInput = z.infer<typeof loginSchema>;

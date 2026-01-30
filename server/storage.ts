import { type User, type InsertUser, type LawCase, type InsertCase, type UpdateCase, CaseStatus } from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  getAllCases(): Promise<LawCase[]>;
  getCaseById(id: string): Promise<LawCase | undefined>;
  createCase(data: InsertCase, createdBy: string): Promise<LawCase>;
  updateCase(id: string, data: UpdateCase): Promise<LawCase | undefined>;
  deleteCase(id: string): Promise<boolean>;
}

const defaultUsers: User[] = [
  { id: "1", username: "omar", password: "1234", name: "المحامي عمر", role: "admin" },
  { id: "2", username: "muhannad", password: "1234", name: "المحامي مهند", role: "admin" },
  { id: "3", username: "secretary", password: "1234", name: "السكرتير", role: "secretary" },
];

const initialCases: LawCase[] = [
  {
    id: "1",
    clientName: "شركة الفلاح للتجارة",
    caseType: "تجاري",
    status: "قيد التنفيذ",
    whatsappLink: "https://wa.me/966501234567",
    driveLink: "https://drive.google.com/folder/abc123",
    nextHearingDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
    notes: "قضية تجارية تتعلق بنزاع عقد توريد",
    reviewNotes: "",
    assignedTo: "1",
    createdBy: "3",
    createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "2",
    clientName: "محمد أحمد العلي",
    caseType: "عمالي",
    status: "مراجعة",
    whatsappLink: "https://wa.me/966509876543",
    driveLink: "https://drive.google.com/folder/def456",
    nextHearingDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
    notes: "قضية فصل تعسفي - مطالبة بالتعويض",
    reviewNotes: "",
    assignedTo: "2",
    createdBy: "3",
    createdAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "3",
    clientName: "مؤسسة النور للمقاولات",
    caseType: "إداري",
    status: "جديد",
    whatsappLink: "",
    driveLink: "",
    nextHearingDate: null,
    notes: "استشارة بخصوص تراخيص البناء",
    reviewNotes: "",
    assignedTo: null,
    createdBy: "3",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "4",
    clientName: "فاطمة سعيد الغامدي",
    caseType: "استشارة",
    status: "جاهز للتسليم",
    whatsappLink: "https://wa.me/966505551234",
    driveLink: "https://drive.google.com/folder/ghi789",
    nextHearingDate: null,
    notes: "استشارة قانونية بخصوص الميراث",
    reviewNotes: "",
    assignedTo: "1",
    createdBy: "3",
    createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "5",
    clientName: "شركة التقنية المتقدمة",
    caseType: "عقد",
    status: "قيد التنفيذ",
    whatsappLink: "https://wa.me/966507778899",
    driveLink: "https://drive.google.com/folder/jkl012",
    nextHearingDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString(),
    notes: "صياغة عقد شراكة تقنية",
    reviewNotes: "",
    assignedTo: "2",
    createdBy: "3",
    createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private cases: Map<string, LawCase>;

  constructor() {
    this.users = new Map();
    this.cases = new Map();
    
    defaultUsers.forEach((u) => this.users.set(u.id, u));
    initialCases.forEach((c) => this.cases.set(c.id, c));
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  async getAllCases(): Promise<LawCase[]> {
    return Array.from(this.cases.values()).sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }

  async getCaseById(id: string): Promise<LawCase | undefined> {
    return this.cases.get(id);
  }

  async createCase(data: InsertCase, createdBy: string): Promise<LawCase> {
    const id = randomUUID();
    const newCase: LawCase = {
      id,
      clientName: data.clientName,
      caseType: data.caseType,
      status: CaseStatus.NEW,
      whatsappLink: data.whatsappLink || "",
      driveLink: data.driveLink || "",
      nextHearingDate: data.nextHearingDate || null,
      notes: data.notes || "",
      reviewNotes: "",
      assignedTo: null,
      createdBy,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.cases.set(id, newCase);
    return newCase;
  }

  async updateCase(id: string, data: UpdateCase): Promise<LawCase | undefined> {
    const existing = this.cases.get(id);
    if (!existing) return undefined;

    const updated: LawCase = {
      ...existing,
      ...data,
      updatedAt: new Date().toISOString(),
    };
    this.cases.set(id, updated);
    return updated;
  }

  async deleteCase(id: string): Promise<boolean> {
    return this.cases.delete(id);
  }
}

export const storage = new MemStorage();

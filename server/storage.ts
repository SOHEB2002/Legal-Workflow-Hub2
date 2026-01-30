import { type User, type LawCase, CaseStatus } from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getAllUsers(): Promise<User[]>;
  getAllCases(): Promise<LawCase[]>;
  getCaseById(id: string): Promise<LawCase | undefined>;
  createCase(data: Partial<LawCase>, createdBy: string): Promise<LawCase>;
  updateCase(id: string, data: Partial<LawCase>): Promise<LawCase | undefined>;
  deleteCase(id: string): Promise<boolean>;
}

const defaultUsers: User[] = [
  { 
    id: "1", 
    username: "manager", 
    password: "1234", 
    name: "مدير الفرع", 
    email: "manager@lawfirm.com",
    phone: "0501234567",
    role: "branch_manager",
    departmentId: null,
    isActive: true,
    canBeAssignedCases: true,
    canBeAssignedConsultations: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  { 
    id: "4", 
    username: "omar", 
    password: "1234", 
    name: "المحامي عمر - رئيس القسم العام", 
    email: "omar@lawfirm.com",
    phone: "0504234567",
    role: "department_head",
    departmentId: "1",
    isActive: true,
    canBeAssignedCases: true,
    canBeAssignedConsultations: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  { 
    id: "6", 
    username: "support", 
    password: "1234", 
    name: "الدعم الإداري", 
    email: "support@lawfirm.com",
    phone: "0506234567",
    role: "admin_support",
    departmentId: null,
    isActive: true,
    canBeAssignedCases: false,
    canBeAssignedConsultations: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

const initialCases: LawCase[] = [];

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

  async getAllUsers(): Promise<User[]> {
    return Array.from(this.users.values());
  }

  async getAllCases(): Promise<LawCase[]> {
    return Array.from(this.cases.values()).sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }

  async getCaseById(id: string): Promise<LawCase | undefined> {
    return this.cases.get(id);
  }

  async createCase(data: Partial<LawCase>, createdBy: string): Promise<LawCase> {
    const id = randomUUID();
    const caseNumber = `C-${new Date().getFullYear()}-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;
    const newCase: LawCase = {
      id,
      caseNumber,
      clientId: data.clientId || "",
      caseType: data.caseType || "عام",
      status: CaseStatus.RECEIVED,
      departmentId: data.departmentId || "",
      assignedLawyers: [],
      primaryLawyerId: null,
      courtName: data.courtName || "",
      courtCaseNumber: data.courtCaseNumber || "",
      najizNumber: data.najizNumber || "",
      judgeName: data.judgeName || "",
      opponentName: data.opponentName || "",
      opponentLawyer: data.opponentLawyer || "",
      opponentPhone: data.opponentPhone || "",
      opponentNotes: data.opponentNotes || "",
      whatsappGroupLink: data.whatsappGroupLink || "",
      googleDriveFolderId: data.googleDriveFolderId || "",
      reviewNotes: "",
      reviewDecision: null,
      reviewActionTaken: null,
      priority: data.priority || "متوسط",
      createdBy,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      closedAt: null,
    };
    this.cases.set(id, newCase);
    return newCase;
  }

  async updateCase(id: string, data: Partial<LawCase>): Promise<LawCase | undefined> {
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

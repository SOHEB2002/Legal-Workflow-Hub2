import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertCaseSchema, updateCaseSchema, loginSchema } from "@shared/schema";
import { z } from "zod";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  app.post("/api/auth/login", async (req, res) => {
    try {
      const data = loginSchema.parse(req.body);
      const user = await storage.getUserByUsername(data.username);
      
      if (!user || user.password !== data.password) {
        return res.status(401).json({ error: "اسم المستخدم أو كلمة المرور غير صحيحة" });
      }

      const { password, ...userWithoutPassword } = user;
      res.json({ user: userWithoutPassword });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  });

  app.get("/api/cases", async (req, res) => {
    try {
      const cases = await storage.getAllCases();
      res.json(cases);
    } catch (error) {
      res.status(500).json({ error: "حدث خطأ في جلب القضايا" });
    }
  });

  app.get("/api/cases/:id", async (req, res) => {
    try {
      const caseItem = await storage.getCaseById(req.params.id);
      if (!caseItem) {
        return res.status(404).json({ error: "القضية غير موجودة" });
      }
      res.json(caseItem);
    } catch (error) {
      res.status(500).json({ error: "حدث خطأ في جلب القضية" });
    }
  });

  app.post("/api/cases", async (req, res) => {
    try {
      const data = insertCaseSchema.parse(req.body);
      const createdBy = req.body.createdBy || "unknown";
      const newCase = await storage.createCase(data, createdBy);
      res.status(201).json(newCase);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "حدث خطأ في إنشاء القضية" });
    }
  });

  app.patch("/api/cases/:id", async (req, res) => {
    try {
      const data = updateCaseSchema.parse(req.body);
      const updated = await storage.updateCase(req.params.id, data);
      if (!updated) {
        return res.status(404).json({ error: "القضية غير موجودة" });
      }
      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "حدث خطأ في تحديث القضية" });
    }
  });

  app.delete("/api/cases/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteCase(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "القضية غير موجودة" });
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "حدث خطأ في حذف القضية" });
    }
  });

  app.get("/api/users", async (req, res) => {
    try {
      const users = [
        { id: "1", name: "المحامي عمر", role: "admin" },
        { id: "2", name: "المحامي مهند", role: "admin" },
        { id: "3", name: "السكرتير", role: "secretary" },
      ];
      res.json(users);
    } catch (error) {
      res.status(500).json({ error: "حدث خطأ في جلب المستخدمين" });
    }
  });

  return httpServer;
}

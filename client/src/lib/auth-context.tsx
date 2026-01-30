import { createContext, useContext, useState, useEffect } from "react";
import type { User, UserRoleType } from "@shared/schema";

interface AuthContextType {
  user: User | null;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
  isAdmin: boolean;
  isLawyer: boolean;
  isSecretary: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const defaultUsers: User[] = [
  { id: "1", username: "omar", password: "1234", name: "المحامي عمر", role: "admin" },
  { id: "2", username: "muhannad", password: "1234", name: "المحامي مهند", role: "admin" },
  { id: "3", username: "secretary", password: "1234", name: "السكرتير", role: "secretary" },
];

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    const stored = localStorage.getItem("lawfirm_user");
    return stored ? JSON.parse(stored) : null;
  });

  useEffect(() => {
    if (user) {
      localStorage.setItem("lawfirm_user", JSON.stringify(user));
    } else {
      localStorage.removeItem("lawfirm_user");
    }
  }, [user]);

  const login = async (username: string, password: string): Promise<boolean> => {
    const foundUser = defaultUsers.find(
      (u) => u.username === username && u.password === password
    );
    if (foundUser) {
      setUser(foundUser);
      return true;
    }
    return false;
  };

  const logout = () => {
    setUser(null);
  };

  const isAdmin = user?.role === "admin";
  const isLawyer = user?.role === "admin" || user?.role === "lawyer";
  const isSecretary = user?.role === "secretary";

  return (
    <AuthContext.Provider value={{ user, login, logout, isAdmin, isLawyer, isSecretary }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

import { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import type { Client, ClientTypeValue } from "@shared/schema";
import { ClientType } from "@shared/schema";
import { apiRequest } from "./queryClient";
import { useAuth } from "./auth-context";

interface ClientsContextType {
  clients: Client[];
  isLoading: boolean;
  addClient: (data: Partial<Client>, createdBy: string) => Promise<Client>;
  updateClient: (id: string, data: Partial<Client>) => Promise<void>;
  deleteClient: (id: string) => Promise<void>;
  getClientById: (id: string) => Client | undefined;
  getClientName: (id: string) => string;
  searchClients: (query: string) => Client[];
  refreshClients: () => Promise<void>;
}

const ClientsContext = createContext<ClientsContextType | undefined>(undefined);

export function ClientsProvider({ children }: { children: React.ReactNode }) {
  const [clients, setClients] = useState<Client[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { user } = useAuth();

  const fetchClients = useCallback(async () => {
    const token = localStorage.getItem("lawfirm_token");
    if (!token) { setIsLoading(false); return; }
    try {
      setIsLoading(true);
      const headers: Record<string, string> = { "Authorization": `Bearer ${token}` };
      const csrfToken = localStorage.getItem("lawfirm_csrf_token");
      if (csrfToken) headers["X-CSRF-Token"] = csrfToken;
      const response = await fetch("/api/clients", { headers, credentials: "include" });
      if (response.ok) {
        const data = await response.json();
        setClients(data);
      } else if (response.status === 401) {
        try {
          const refreshRes = await fetch("/api/auth/refresh", {
            method: "POST",
            headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
          });
          if (refreshRes.ok) {
            const refreshData = await refreshRes.json();
            if (refreshData.token) {
              localStorage.setItem("lawfirm_token", refreshData.token);
              if (refreshData.csrfToken) localStorage.setItem("lawfirm_csrf_token", refreshData.csrfToken);
              const retryHeaders: Record<string, string> = { "Authorization": `Bearer ${refreshData.token}` };
              if (refreshData.csrfToken) retryHeaders["X-CSRF-Token"] = refreshData.csrfToken;
              const retryResponse = await fetch("/api/clients", { headers: retryHeaders, credentials: "include" });
              if (retryResponse.ok) {
                const data = await retryResponse.json();
                setClients(data);
              }
            }
          }
        } catch (_) {}
      }
    } catch (error) {
      console.error("Failed to fetch clients:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const retryRef = useRef(false);
  useEffect(() => {
    if (user) {
      retryRef.current = false;
      fetchClients().then(() => {
        if (!retryRef.current) {
          retryRef.current = true;
          setTimeout(() => fetchClients(), 3000);
        }
      });
    } else { setClients([]); setIsLoading(false); }
  }, [user, fetchClients]);

  const addClient = async (data: Partial<Client>, createdBy: string): Promise<Client> => {
    const clientData = {
      clientType: data.clientType || "فرد",
      individualName: data.individualName || null,
      nationalId: data.nationalId || null,
      phone: data.phone || "",
      companyName: data.companyName || null,
      commercialRegister: data.commercialRegister || null,
      representativeName: data.representativeName || null,
      representativeTitle: data.representativeTitle || null,
      companyPhone: data.companyPhone || null,
      email: data.email || "",
      address: data.address || "",
      notes: data.notes || "",
      createdBy,
    };
    
    const response = await apiRequest("POST", "/api/clients", clientData);
    const newClient = await response.json();
    setClients((prev) => [newClient, ...prev]);
    return newClient;
  };

  const updateClient = async (id: string, data: Partial<Client>): Promise<void> => {
    await apiRequest("PATCH", `/api/clients/${id}`, data);
    setClients((prev) =>
      prev.map((c) =>
        c.id === id
          ? { ...c, ...data, updatedAt: new Date().toISOString() }
          : c
      )
    );
  };

  const deleteClient = async (id: string): Promise<void> => {
    await apiRequest("DELETE", `/api/clients/${id}`);
    setClients((prev) => prev.filter((c) => c.id !== id));
  };

  const getClientById = (id: string) => clients.find((c) => c.id === id);

  const getClientName = (id: string): string => {
    const client = clients.find((c) => c.id === id);
    if (!client) return "غير معروف";
    return client.clientType === "فرد" 
      ? client.individualName || "فرد" 
      : client.companyName || "شركة";
  };

  const searchClients = (query: string) => {
    const lowerQuery = query.toLowerCase();
    return clients.filter((c) => {
      const name = c.clientType === "فرد" ? c.individualName : c.companyName;
      return (
        name?.toLowerCase().includes(lowerQuery) ||
        c.phone.includes(query) ||
        c.nationalId?.includes(query) ||
        c.commercialRegister?.includes(query)
      );
    });
  };

  return (
    <ClientsContext.Provider
      value={{
        clients,
        isLoading,
        addClient,
        updateClient,
        deleteClient,
        getClientById,
        getClientName,
        searchClients,
        refreshClients: fetchClients,
      }}
    >
      {children}
    </ClientsContext.Provider>
  );
}

export function useClients() {
  const context = useContext(ClientsContext);
  if (context === undefined) {
    throw new Error("useClients must be used within a ClientsProvider");
  }
  return context;
}

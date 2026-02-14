import { createContext, useContext, useState, useEffect, useCallback } from "react";
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
      const response = await fetch("/api/clients", { headers });
      if (response.ok) {
        const data = await response.json();
        setClients(data);
      }
    } catch (error) {
      // fetch clients failed silently
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) fetchClients();
    else { setClients([]); setIsLoading(false); }
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

import { createContext, useContext, useState, useEffect } from "react";
import type { Client, ClientTypeValue } from "@shared/schema";
import { ClientType } from "@shared/schema";

interface ClientsContextType {
  clients: Client[];
  addClient: (data: Partial<Client>, createdBy: string) => Client;
  updateClient: (id: string, data: Partial<Client>) => void;
  deleteClient: (id: string) => void;
  getClientById: (id: string) => Client | undefined;
  getClientName: (id: string) => string;
  searchClients: (query: string) => Client[];
}

const ClientsContext = createContext<ClientsContextType | undefined>(undefined);

const generateId = () => Math.random().toString(36).substr(2, 9);

const initialClients: Client[] = [
  {
    id: "1",
    clientType: "شركة",
    individualName: null,
    nationalId: null,
    phone: "0501234567",
    companyName: "شركة الفلاح للتجارة",
    commercialRegister: "1010123456",
    representativeName: "أحمد الفلاح",
    representativeTitle: "المدير العام",
    companyPhone: "0112345678",
    email: "info@alfalah.com",
    address: "الرياض - حي العليا",
    notes: "",
    createdBy: "6",
    createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "2",
    clientType: "فرد",
    individualName: "محمد أحمد العلي",
    nationalId: "1234567890",
    phone: "0509876543",
    companyName: null,
    commercialRegister: null,
    representativeName: null,
    representativeTitle: null,
    companyPhone: null,
    email: "mohammed@email.com",
    address: "الرياض - حي النزهة",
    notes: "عميل منذ 2023",
    createdBy: "6",
    createdAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "3",
    clientType: "شركة",
    individualName: null,
    nationalId: null,
    phone: "0505551234",
    companyName: "مؤسسة النور للمقاولات",
    commercialRegister: "1010789012",
    representativeName: "سعيد النور",
    representativeTitle: "صاحب المؤسسة",
    companyPhone: "0112223344",
    email: "info@alnoor.com",
    address: "جدة - حي الصفا",
    notes: "",
    createdBy: "6",
    createdAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

export function ClientsProvider({ children }: { children: React.ReactNode }) {
  const [clients, setClients] = useState<Client[]>(() => {
    const stored = localStorage.getItem("lawfirm_clients");
    return stored ? JSON.parse(stored) : initialClients;
  });

  useEffect(() => {
    localStorage.setItem("lawfirm_clients", JSON.stringify(clients));
  }, [clients]);

  const addClient = (data: Partial<Client>, createdBy: string): Client => {
    const newClient: Client = {
      id: generateId(),
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
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setClients((prev) => [newClient, ...prev]);
    return newClient;
  };

  const updateClient = (id: string, data: Partial<Client>) => {
    setClients((prev) =>
      prev.map((c) =>
        c.id === id
          ? { ...c, ...data, updatedAt: new Date().toISOString() }
          : c
      )
    );
  };

  const deleteClient = (id: string) => {
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
        addClient,
        updateClient,
        deleteClient,
        getClientById,
        getClientName,
        searchClients,
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

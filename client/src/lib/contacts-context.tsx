import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { ContactLog, FollowUpStatus } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "./auth-context";

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem("lawfirm_token");
  return token ? { "Authorization": `Bearer ${token}` } : {};
}

interface ContactsContextType {
  contacts: ContactLog[];
  isLoading: boolean;
  addContact: (contact: Omit<ContactLog, "id" | "createdAt" | "updatedAt">) => Promise<ContactLog>;
  updateContact: (id: string, data: Partial<ContactLog>) => Promise<void>;
  deleteContact: (id: string) => Promise<void>;
  getContactById: (id: string) => ContactLog | undefined;
  getContactsByClientId: (clientId: string) => ContactLog[];
  getPendingFollowUps: () => ContactLog[];
  getOverdueFollowUps: () => ContactLog[];
  getLastContactByClientId: (clientId: string) => ContactLog | undefined;
  markFollowUpComplete: (id: string) => void;
}

const ContactsContext = createContext<ContactsContextType | undefined>(undefined);

export function ContactsProvider({ children }: { children: ReactNode }) {
  const [contacts, setContacts] = useState<ContactLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { user } = useAuth();

  const fetchContacts = useCallback(async () => {
    const token = localStorage.getItem("lawfirm_token");
    if (!token) { setIsLoading(false); return; }
    try {
      const res = await fetch("/api/contact-logs", {
        credentials: "include",
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setContacts(data);
      }
    } catch (error) {
      // fetch contacts failed silently
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) fetchContacts();
    else { setContacts([]); setIsLoading(false); }
  }, [user, fetchContacts]);

  const addContact = async (contactData: Omit<ContactLog, "id" | "createdAt" | "updatedAt">): Promise<ContactLog> => {
    const res = await apiRequest("POST", "/api/contact-logs", contactData);
    const newContact = await res.json();
    await fetchContacts();
    return newContact;
  };

  const updateContact = async (id: string, data: Partial<ContactLog>): Promise<void> => {
    await apiRequest("PATCH", `/api/contact-logs/${id}`, data);
    await fetchContacts();
  };

  const deleteContact = async (id: string): Promise<void> => {
    await apiRequest("DELETE", `/api/contact-logs/${id}`);
    await fetchContacts();
  };

  const getContactById = (id: string): ContactLog | undefined => {
    return contacts.find((contact) => contact.id === id);
  };

  const getContactsByClientId = (clientId: string): ContactLog[] => {
    return contacts
      .filter((contact) => contact.clientId === clientId)
      .sort((a, b) => new Date(b.contactDate).getTime() - new Date(a.contactDate).getTime());
  };

  const getPendingFollowUps = (): ContactLog[] => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    return contacts.filter((contact) => {
      if (contact.followUpStatus !== FollowUpStatus.PENDING) return false;
      if (!contact.nextFollowUpDate) return false;
      return true;
    }).sort((a, b) => 
      new Date(a.nextFollowUpDate!).getTime() - new Date(b.nextFollowUpDate!).getTime()
    );
  };

  const getOverdueFollowUps = (): ContactLog[] => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    return contacts.filter((contact) => {
      if (contact.followUpStatus !== FollowUpStatus.PENDING) return false;
      if (!contact.nextFollowUpDate) return false;
      return new Date(contact.nextFollowUpDate) < today;
    });
  };

  const getLastContactByClientId = (clientId: string): ContactLog | undefined => {
    const clientContacts = getContactsByClientId(clientId);
    return clientContacts[0];
  };

  const markFollowUpComplete = (id: string) => {
    updateContact(id, { followUpStatus: FollowUpStatus.COMPLETED });
  };

  return (
    <ContactsContext.Provider
      value={{
        contacts,
        isLoading,
        addContact,
        updateContact,
        deleteContact,
        getContactById,
        getContactsByClientId,
        getPendingFollowUps,
        getOverdueFollowUps,
        getLastContactByClientId,
        markFollowUpComplete,
      }}
    >
      {children}
    </ContactsContext.Provider>
  );
}

export function useContacts() {
  const context = useContext(ContactsContext);
  if (context === undefined) {
    throw new Error("useContacts must be used within a ContactsProvider");
  }
  return context;
}

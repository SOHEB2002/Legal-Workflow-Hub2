import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { ContactLog, ContactTypeValue, FollowUpStatusValue, FollowUpStatus } from "@shared/schema";

interface ContactsContextType {
  contacts: ContactLog[];
  addContact: (contact: Omit<ContactLog, "id" | "createdAt" | "updatedAt">) => ContactLog;
  updateContact: (id: string, data: Partial<ContactLog>) => void;
  deleteContact: (id: string) => void;
  getContactById: (id: string) => ContactLog | undefined;
  getContactsByClientId: (clientId: string) => ContactLog[];
  getPendingFollowUps: () => ContactLog[];
  getOverdueFollowUps: () => ContactLog[];
  getLastContactByClientId: (clientId: string) => ContactLog | undefined;
  markFollowUpComplete: (id: string) => void;
}

const ContactsContext = createContext<ContactsContextType | undefined>(undefined);

const STORAGE_KEY = "lawfirm_contacts";

function generateId(): string {
  return `contact_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export function ContactsProvider({ children }: { children: ReactNode }) {
  const [contacts, setContacts] = useState<ContactLog[]>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(contacts));
  }, [contacts]);

  const addContact = (contactData: Omit<ContactLog, "id" | "createdAt" | "updatedAt">): ContactLog => {
    const now = new Date().toISOString();
    const newContact: ContactLog = {
      ...contactData,
      id: generateId(),
      createdAt: now,
      updatedAt: now,
    };
    setContacts((prev) => [...prev, newContact]);
    return newContact;
  };

  const updateContact = (id: string, data: Partial<ContactLog>) => {
    setContacts((prev) =>
      prev.map((contact) =>
        contact.id === id
          ? { ...contact, ...data, updatedAt: new Date().toISOString() }
          : contact
      )
    );
  };

  const deleteContact = (id: string) => {
    setContacts((prev) => prev.filter((contact) => contact.id !== id));
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

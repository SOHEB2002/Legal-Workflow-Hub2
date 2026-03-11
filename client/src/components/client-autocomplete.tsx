import { useState, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Plus, X, UserPlus } from "lucide-react";
import { useClients } from "@/lib/clients-context";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";

interface ClientAutocompleteProps {
  value: string;
  onChange: (clientId: string) => void;
}

export function ClientAutocomplete({ value, onChange }: ClientAutocompleteProps) {
  const { clients, getClientName, addClient } = useClients();
  const { user } = useAuth();
  const { toast } = useToast();

  const [searchText, setSearchText] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newClientData, setNewClientData] = useState({
    clientType: "فرد" as "فرد" | "شركة" | "مؤسسة" | "وقف" | "جمعية",
    individualName: "",
    phone: "",
    companyName: "",
  });

  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (value) {
      const name = getClientName(value);
      if (name && name !== "-") {
        setSearchText(name);
      }
    }
  }, [value, getClientName]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredClients = clients.filter((client) => {
    const name = getClientName(client.id).toLowerCase();
    const phone = client.phone?.toLowerCase() || "";
    const query = searchText.toLowerCase();
    return name.includes(query) || phone.includes(query);
  });

  const handleSelect = (clientId: string) => {
    onChange(clientId);
    setSearchText(getClientName(clientId));
    setIsOpen(false);
  };

  const handleClear = () => {
    onChange("");
    setSearchText("");
    inputRef.current?.focus();
  };

  const handleAddNewClient = async () => {
    if (!user) return;
    const name = newClientData.clientType === "فرد" ? newClientData.individualName : newClientData.companyName;
    if (!name.trim()) {
      toast({ title: "يرجى إدخال الاسم", variant: "destructive" });
      return;
    }
    try {
      const newClient = await addClient({
        clientType: newClientData.clientType,
        individualName: newClientData.clientType === "فرد" ? newClientData.individualName : undefined,
        companyName: newClientData.clientType !== "فرد" ? newClientData.companyName : undefined,
        phone: newClientData.phone,
      }, user.id);
      toast({ title: "تم إضافة العميل بنجاح" });
      handleSelect(newClient.id);
      setShowAddDialog(false);
      setNewClientData({ clientType: "فرد", individualName: "", phone: "", companyName: "" });
    } catch {
      toast({ title: "حدث خطأ أثناء إضافة العميل", variant: "destructive" });
    }
  };

  return (
    <>
      <div ref={wrapperRef} className="relative">
        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            ref={inputRef}
            data-testid="input-client-search"
            value={searchText}
            onChange={(e) => {
              const newText = e.target.value;
              setSearchText(newText);
              setIsOpen(true);
              if (value) {
                const selectedName = getClientName(value);
                if (newText !== selectedName) {
                  onChange("");
                }
              }
            }}
            onFocus={() => setIsOpen(true)}
            placeholder="ابحث عن العميل بالاسم أو رقم الجوال..."
            className="pr-10 pl-8"
          />
          {value && (
            <button
              type="button"
              onClick={handleClear}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              data-testid="button-clear-client"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        {isOpen && (
          <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-md shadow-md max-h-[200px] overflow-y-auto">
            {filteredClients.length > 0 ? (
              filteredClients.map((client) => (
                <button
                  key={client.id}
                  type="button"
                  data-testid={`option-client-${client.id}`}
                  className="w-full text-right px-3 py-2 text-sm hover-elevate cursor-pointer flex items-center justify-between"
                  onClick={() => handleSelect(client.id)}
                >
                  <span>{getClientName(client.id)}</span>
                  {client.phone && (
                    <span className="text-muted-foreground text-xs">{client.phone}</span>
                  )}
                </button>
              ))
            ) : (
              <div className="px-3 py-2 text-sm text-muted-foreground text-center" data-testid="text-no-results">
                لا توجد نتائج
              </div>
            )}
            <button
              type="button"
              data-testid="button-add-new-client"
              className="w-full text-right px-3 py-2 text-sm border-t border-border hover-elevate cursor-pointer flex items-center gap-2 text-accent font-medium"
              onClick={() => {
                setIsOpen(false);
                setShowAddDialog(true);
              }}
            >
              <UserPlus className="w-4 h-4" />
              إضافة عميل جديد
            </button>
          </div>
        )}
      </div>

      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>إضافة عميل جديد</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>نوع العميل</Label>
              <Select
                value={newClientData.clientType}
                onValueChange={(v: "فرد" | "شركة" | "مؤسسة" | "وقف" | "جمعية") => setNewClientData({ ...newClientData, clientType: v })}
              >
                <SelectTrigger data-testid="select-new-client-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="فرد">فرد</SelectItem>
                  <SelectItem value="شركة">شركة</SelectItem>
                  <SelectItem value="مؤسسة">مؤسسة</SelectItem>
                  <SelectItem value="وقف">وقف</SelectItem>
                  <SelectItem value="جمعية">جمعية</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {newClientData.clientType === "فرد" ? (
              <div>
                <Label>اسم العميل</Label>
                <Input
                  data-testid="input-new-client-name"
                  value={newClientData.individualName}
                  onChange={(e) => setNewClientData({ ...newClientData, individualName: e.target.value })}
                  placeholder="الاسم الكامل"
                />
              </div>
            ) : (
              <div>
                <Label>اسم {newClientData.clientType === "شركة" ? "الشركة" : newClientData.clientType === "مؤسسة" ? "المؤسسة" : newClientData.clientType === "وقف" ? "الوقف" : newClientData.clientType === "جمعية" ? "الجمعية" : "الجهة"}</Label>
                <Input
                  data-testid="input-new-company-name"
                  value={newClientData.companyName}
                  onChange={(e) => setNewClientData({ ...newClientData, companyName: e.target.value })}
                  placeholder={`اسم ${newClientData.clientType === "شركة" ? "الشركة" : newClientData.clientType === "مؤسسة" ? "المؤسسة" : newClientData.clientType === "وقف" ? "الوقف" : newClientData.clientType === "جمعية" ? "الجمعية" : "الجهة"}`}
                />
              </div>
            )}
            <div>
              <Label>رقم الجوال</Label>
              <Input
                data-testid="input-new-client-phone"
                value={newClientData.phone}
                onChange={(e) => setNewClientData({ ...newClientData, phone: e.target.value })}
                placeholder="05xxxxxxxx"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" data-testid="button-cancel-add-client" onClick={() => setShowAddDialog(false)}>إلغاء</Button>
            <Button data-testid="button-confirm-add-client" onClick={handleAddNewClient}>
              <Plus className="w-4 h-4 ml-2" />
              إضافة
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

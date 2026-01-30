import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Plus, Search, Pencil, Trash2, Building2, User, Phone, Mail } from "lucide-react";
import { useClients } from "@/lib/clients-context";
import { useAuth } from "@/lib/auth-context";
import { useCases } from "@/lib/cases-context";
import { useConsultations } from "@/lib/consultations-context";
import type { Client, ClientTypeValue } from "@shared/schema";
import { ClientType } from "@shared/schema";

export default function ClientsPage() {
  const { clients, addClient, updateClient, deleteClient, getClientName } = useClients();
  const { user, permissions } = useAuth();
  const { cases } = useCases();
  const { consultations } = useConsultations();
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);

  const [formData, setFormData] = useState<Partial<Client>>({
    clientType: "فرد",
    individualName: "",
    nationalId: "",
    phone: "",
    companyName: "",
    commercialRegister: "",
    representativeName: "",
    representativeTitle: "",
    companyPhone: "",
    email: "",
    address: "",
    notes: "",
  });

  const resetForm = () => {
    setFormData({
      clientType: "فرد",
      individualName: "",
      nationalId: "",
      phone: "",
      companyName: "",
      commercialRegister: "",
      representativeName: "",
      representativeTitle: "",
      companyPhone: "",
      email: "",
      address: "",
      notes: "",
    });
  };

  const handleAddClient = () => {
    if (!user) return;
    addClient(formData, user.id);
    setIsAddDialogOpen(false);
    resetForm();
  };

  const handleEditClient = () => {
    if (!editingClient) return;
    updateClient(editingClient.id, formData);
    setEditingClient(null);
    resetForm();
  };

  const openEditDialog = (client: Client) => {
    setEditingClient(client);
    setFormData({ ...client });
  };

  const getClientCasesCount = (clientId: string) => {
    return cases.filter((c) => c.clientId === clientId).length;
  };

  const getClientConsultationsCount = (clientId: string) => {
    return consultations.filter((c) => c.clientId === clientId).length;
  };

  const filteredClients = clients.filter((client) => {
    const name = client.clientType === "فرد" ? client.individualName : client.companyName;
    const matchesSearch =
      name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      client.phone.includes(searchQuery) ||
      client.email.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = typeFilter === "all" || client.clientType === typeFilter;
    return matchesSearch && matchesType;
  });

  const renderClientForm = () => (
    <div className="space-y-4">
      <div>
        <Label>نوع العميل</Label>
        <Select
          value={formData.clientType}
          onValueChange={(value: ClientTypeValue) =>
            setFormData({ ...formData, clientType: value })
          }
        >
          <SelectTrigger data-testid="select-client-type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="فرد">فرد</SelectItem>
            <SelectItem value="شركة">شركة</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {formData.clientType === "فرد" ? (
        <>
          <div>
            <Label>الاسم الكامل</Label>
            <Input
              data-testid="input-individual-name"
              value={formData.individualName || ""}
              onChange={(e) => setFormData({ ...formData, individualName: e.target.value })}
              placeholder="أدخل اسم العميل"
            />
          </div>
          <div>
            <Label>رقم الهوية</Label>
            <Input
              data-testid="input-national-id"
              value={formData.nationalId || ""}
              onChange={(e) => setFormData({ ...formData, nationalId: e.target.value })}
              placeholder="رقم الهوية الوطنية"
            />
          </div>
        </>
      ) : (
        <>
          <div>
            <Label>اسم الشركة</Label>
            <Input
              data-testid="input-company-name"
              value={formData.companyName || ""}
              onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
              placeholder="أدخل اسم الشركة"
            />
          </div>
          <div>
            <Label>السجل التجاري</Label>
            <Input
              data-testid="input-commercial-register"
              value={formData.commercialRegister || ""}
              onChange={(e) => setFormData({ ...formData, commercialRegister: e.target.value })}
              placeholder="رقم السجل التجاري"
            />
          </div>
          <div>
            <Label>اسم الممثل</Label>
            <Input
              data-testid="input-representative-name"
              value={formData.representativeName || ""}
              onChange={(e) => setFormData({ ...formData, representativeName: e.target.value })}
              placeholder="اسم ممثل الشركة"
            />
          </div>
          <div>
            <Label>صفة الممثل</Label>
            <Input
              data-testid="input-representative-title"
              value={formData.representativeTitle || ""}
              onChange={(e) => setFormData({ ...formData, representativeTitle: e.target.value })}
              placeholder="مثال: المدير العام"
            />
          </div>
        </>
      )}

      <div>
        <Label>رقم الجوال</Label>
        <Input
          data-testid="input-phone"
          value={formData.phone || ""}
          onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
          placeholder="05xxxxxxxx"
        />
      </div>
      <div>
        <Label>البريد الإلكتروني</Label>
        <Input
          data-testid="input-email"
          type="email"
          value={formData.email || ""}
          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          placeholder="email@example.com"
        />
      </div>
      <div>
        <Label>العنوان</Label>
        <Input
          data-testid="input-address"
          value={formData.address || ""}
          onChange={(e) => setFormData({ ...formData, address: e.target.value })}
          placeholder="المدينة - الحي"
        />
      </div>
      <div>
        <Label>ملاحظات</Label>
        <Textarea
          data-testid="input-notes"
          value={formData.notes || ""}
          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
          placeholder="ملاحظات إضافية..."
        />
      </div>
    </div>
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">إدارة العملاء</h1>
          <p className="text-muted-foreground">قائمة العملاء (أفراد وشركات)</p>
        </div>
        {permissions.canAddCasesAndConsultations && (
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-add-client" onClick={resetForm}>
                <Plus className="w-4 h-4 ml-2" />
                إضافة عميل
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>إضافة عميل جديد</DialogTitle>
              </DialogHeader>
              {renderClientForm()}
              <Button data-testid="button-submit-client" onClick={handleAddClient} className="w-full">
                إضافة العميل
              </Button>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                data-testid="input-search-clients"
                placeholder="بحث بالاسم أو الجوال..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pr-10"
              />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[150px]" data-testid="select-type-filter">
                <SelectValue placeholder="النوع" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">الكل</SelectItem>
                <SelectItem value="فرد">أفراد</SelectItem>
                <SelectItem value="شركة">شركات</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">العميل</TableHead>
                <TableHead className="text-right">النوع</TableHead>
                <TableHead className="text-right">التواصل</TableHead>
                <TableHead className="text-right">القضايا</TableHead>
                <TableHead className="text-right">الاستشارات</TableHead>
                <TableHead className="text-right">الإجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredClients.map((client) => (
                <TableRow key={client.id} data-testid={`row-client-${client.id}`}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                        {client.clientType === "فرد" ? (
                          <User className="w-5 h-5 text-primary" />
                        ) : (
                          <Building2 className="w-5 h-5 text-primary" />
                        )}
                      </div>
                      <div>
                        <p className="font-medium">
                          {client.clientType === "فرد" ? client.individualName : client.companyName}
                        </p>
                        {client.clientType === "شركة" && client.representativeName && (
                          <p className="text-sm text-muted-foreground">
                            {client.representativeName} - {client.representativeTitle}
                          </p>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={client.clientType === "فرد" ? "secondary" : "outline"}>
                      {client.clientType}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      <div className="flex items-center gap-1 text-sm">
                        <Phone className="w-3 h-3" />
                        {client.phone}
                      </div>
                      {client.email && (
                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                          <Mail className="w-3 h-3" />
                          {client.email}
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{getClientCasesCount(client.id)}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{getClientConsultationsCount(client.id)}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            size="icon"
                            variant="ghost"
                            data-testid={`button-edit-client-${client.id}`}
                            onClick={() => openEditDialog(client)}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>تعديل بيانات العميل</TooltipContent>
                      </Tooltip>
                      {permissions.canManageUsers && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="icon"
                              variant="ghost"
                              data-testid={`button-delete-client-${client.id}`}
                              onClick={() => deleteClient(client.id)}
                            >
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>حذف العميل</TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!editingClient} onOpenChange={(open) => !open && setEditingClient(null)}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>تعديل بيانات العميل</DialogTitle>
          </DialogHeader>
          {renderClientForm()}
          <Button data-testid="button-update-client" onClick={handleEditClient} className="w-full">
            حفظ التعديلات
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
